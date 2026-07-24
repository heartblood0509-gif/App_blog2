"""줄 순서 변경(드래그) — reorder-lines 엔드포인트 테스트.

핵심은 두 가지다.
1. lines(script_json)와 line_sources_json 은 **같은 순열**로 움직여야 한다. sources 는 인덱스
   병렬 배열이라 한쪽만 재배열하면 이미지 줄이 영상 줄로 뒤바뀐다.
2. 완전 순열만 허용한다. 누락/중복/미지 id 를 부분 반영하면 줄이 사라지거나 복제된다.
"""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.models import ReorderLinesRequest
from api.routes import preview as preview_module
from api.routes.assets import resolve_asset_line
from api.routes.preview import reorder_lines
from db.database import Base
from db.models import Job, JobTask, User


@pytest.fixture
def env(tmp_path, monkeypatch):
    storage_root = tmp_path / "storage"
    storage_root.mkdir()
    monkeypatch.setattr(preview_module.settings, "STORAGE_DIR", str(storage_root))
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()
    user = User(id="testuser0001", email="t@example.com", nickname="tester", approved=True)
    db.add(user)
    db.commit()
    yield db, user
    db.close()


def _job(db, user, *, sources=None, status="preview_ready", mode="user_assets"):
    """3줄짜리 카드 B draft. 줄마다 소스를 다르게 둬 재배열이 어긋나면 바로 드러나게 한다."""
    lines = [
        {"line_id": lid, "text": text, "image_prompt": "", "motion": "none",
         "asset_version": 1, "status": "ready"}
        for lid, text in (("l1", "첫 줄"), ("l2", "둘째 줄"), ("l3", "셋째 줄"))
    ]
    job = Job(
        id="testjob01234",
        user_id=user.id,
        status=status,
        generation_mode=mode,
        script_json=json.dumps(lines, ensure_ascii=False),
        line_sources_json=json.dumps(sources or ["ai", "image", "clip"]),
    )
    db.add(job)
    db.commit()
    return job


def _order(job, db):
    db.refresh(job)
    return [l["line_id"] for l in json.loads(job.script_json)]


@pytest.mark.asyncio
async def test_reorders_lines_and_sources_together(env):
    db, user = env
    job = _job(db, user)  # l1=ai, l2=image, l3=clip

    res = await reorder_lines(ReorderLinesRequest(line_ids=["l3", "l1", "l2"]), job.id, db, user)

    assert [l.line_id for l in res.lines] == ["l3", "l1", "l2"]
    # 소스가 줄을 따라와야 한다 — 안 따라오면 영상 줄에 이미지가 붙는다.
    assert res.sources == ["clip", "ai", "image"]
    assert _order(job, db) == ["l3", "l1", "l2"]
    assert json.loads(job.line_sources_json) == ["clip", "ai", "image"]


@pytest.mark.asyncio
async def test_line_content_travels_with_the_line(env):
    db, user = env
    job = _job(db, user)
    res = await reorder_lines(ReorderLinesRequest(line_ids=["l2", "l3", "l1"]), job.id, db, user)
    assert [l.text for l in res.lines] == ["둘째 줄", "셋째 줄", "첫 줄"]


@pytest.mark.asyncio
async def test_same_order_is_noop(env):
    db, user = env
    job = _job(db, user)
    res = await reorder_lines(ReorderLinesRequest(line_ids=["l1", "l2", "l3"]), job.id, db, user)
    assert [l.line_id for l in res.lines] == ["l1", "l2", "l3"]
    assert res.sources == ["ai", "image", "clip"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad",
    [
        ["l1", "l2"],              # 누락 — 줄이 사라진다
        ["l1", "l1", "l2"],        # 중복 — 줄이 복제된다
        ["l1", "l2", "l9"],        # 미지 id
        ["l1", "l2", "l3", "l3"],  # 길이 초과
    ],
)
async def test_rejects_non_permutation(env, bad):
    db, user = env
    job = _job(db, user)
    with pytest.raises(HTTPException) as e:
        await reorder_lines(ReorderLinesRequest(line_ids=bad), job.id, db, user)
    assert e.value.status_code == 400
    assert _order(job, db) == ["l1", "l2", "l3"]  # 부분 반영 없음


@pytest.mark.asyncio
async def test_rejected_outside_edit_stage(env):
    # 렌더가 시작된 뒤 늦게 도착한 저장이 확정된 순서를 덮으면 안 된다.
    db, user = env
    job = _job(db, user, status="awaiting_confirmation")
    with pytest.raises(HTTPException) as e:
        await reorder_lines(ReorderLinesRequest(line_ids=["l3", "l2", "l1"]), job.id, db, user)
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_rejected_for_card_a(env):
    db, user = env
    job = _job(db, user, mode="ai_full")
    with pytest.raises(HTTPException) as e:
        await reorder_lines(ReorderLinesRequest(line_ids=["l3", "l2", "l1"]), job.id, db, user)
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_rejected_while_assets_generating(env):
    # 백그라운드 작업이 줄 인덱스를 캡처해 둔 상태라, 중간에 옮기면 엉뚱한 줄에 결과가 꽂힌다.
    db, user = env
    job = _job(db, user)
    db.add(JobTask(
        id="task00000001", job_id=job.id, kind="card_b_missing_images", status="running",
        payload_json=json.dumps({"line_ids": ["l2"], "completed_line_ids": []}),
    ))
    db.commit()
    with pytest.raises(HTTPException) as e:
        await reorder_lines(ReorderLinesRequest(line_ids=["l3", "l2", "l1"]), job.id, db, user)
    assert e.value.status_code == 409
    assert _order(job, db) == ["l1", "l2", "l3"]


@pytest.mark.asyncio
async def test_sources_length_mismatch_rejected(env):
    db, user = env
    job = _job(db, user, sources=["ai", "image"])  # 줄 3개인데 소스 2개
    with pytest.raises(HTTPException) as e:
        await reorder_lines(ReorderLinesRequest(line_ids=["l3", "l2", "l1"]), job.id, db, user)
    assert e.value.status_code == 400


# ── 자산 서빙 해석 — 순서를 바꿔도 줄에 맞는 이미지/영상이 나가야 한다 ──────────

def _asset_lines(*ids):
    return [{"line_id": lid, "text": lid} for lid in ids]


def test_asset_line_id_wins_over_stale_index():
    """화면(새 순서)과 서버(옛 순서) 시차의 방어. 번호가 아니라 줄 id 를 따라야 한다.

    이게 없으면 드래그 도중 요청한 /images/0 이 옛 0번 줄 이미지를 돌려주고, 그게 그대로
    브라우저 캐시에 박혀 순서를 바꿀 때마다 남의 이미지가 보인다.
    """
    lines = _asset_lines("l3", "l1", "l2")  # 서버는 이미 재배열됨
    # 화면이 옛 번호(0)로 요청했어도 line_id 가 진실
    assert resolve_asset_line(lines, 0, "l2") == 2
    assert resolve_asset_line(lines, 2, "l3") == 0


def test_asset_falls_back_to_index_without_line_id():
    """구 URL(카드 A 미리보기 등)은 line_id 가 없다 → 예전대로 번호로 해석."""
    lines = _asset_lines("l1", "l2", "l3")
    assert resolve_asset_line(lines, 1, None) == 1
    assert resolve_asset_line(lines, 9, None) is None


def test_asset_unknown_line_id_is_not_found():
    """방금 지워진 줄 등 — 번호로 폴백하면 남의 자산이 나가므로 404 로 보낸다."""
    lines = _asset_lines("l1", "l2")
    assert resolve_asset_line(lines, 0, "gone") is None
