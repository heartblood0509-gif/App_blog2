"""카드 B line-visual 엔드포인트 + transform 생존(split) 단위 테스트."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.routes import preview as preview_module
from api.routes.preview import set_line_visual, split_line
from api.models import LineVisualRequest, LineTransform, MotionType, SplitLineRequest
from db.database import Base
from db.models import Job, User
from core.user_assets_visual import new_line_id


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


def _line(line_id, text, **extra):
    d = {
        "line_id": line_id,
        "text": text,
        "image_prompt": "",
        "motion": "none",
        "asset_version": 1,
        "status": "ready",
    }
    d.update(extra)
    return d


def _job(db, user, lines, sources):
    job = Job(
        id="testjob01234",
        user_id=user.id,
        status="preview_ready",
        generation_mode="user_assets",
        script_json=json.dumps(lines, ensure_ascii=False),
        line_sources_json=json.dumps(sources),
    )
    db.add(job)
    db.commit()
    return job


@pytest.mark.asyncio
async def test_save_transform_and_motion(env):
    db, user = env
    lid = new_line_id()
    job = _job(db, user, [_line(lid, "첫 줄")], ["image"])

    body = LineVisualRequest(
        line_index=0, line_id=lid,
        transform=LineTransform(scale=1.5, x=0.2, y=-0.3),
        motion=MotionType.ZOOM_IN,
    )
    res = await set_line_visual(body, job.id, db, user)
    assert res["ok"] is True
    assert res["transform"] == {"scale": 1.5, "x": 0.2, "y": -0.3}
    assert res["motion"] == "zoom_in"

    db.refresh(job)
    saved = json.loads(job.script_json)[0]
    assert saved["transform"] == {"scale": 1.5, "x": 0.2, "y": -0.3}
    assert saved["motion"] == "zoom_in"


@pytest.mark.asyncio
async def test_transform_clamped_server_side(env):
    db, user = env
    lid = new_line_id()
    job = _job(db, user, [_line(lid, "첫 줄")], ["image"])
    body = LineVisualRequest(line_index=0, line_id=lid, transform=LineTransform(scale=99, x=9, y=-9))
    res = await set_line_visual(body, job.id, db, user)
    assert res["transform"]["scale"] == 3.0  # SCALE_MAX
    assert res["transform"]["x"] == 1.5       # OFFSET_MAX
    assert res["transform"]["y"] == -1.5


@pytest.mark.asyncio
async def test_clip_line_rejects_pan_motion(env):
    db, user = env
    lid = new_line_id()
    job = _job(db, user, [_line(lid, "영상 줄")], ["clip"])
    body = LineVisualRequest(line_index=0, line_id=lid, motion=MotionType.PAN_LEFT)
    with pytest.raises(Exception) as ei:
        await set_line_visual(body, job.id, db, user)
    assert getattr(ei.value, "status_code", None) == 400


@pytest.mark.asyncio
async def test_clip_line_allows_zoom_in(env):
    db, user = env
    lid = new_line_id()
    job = _job(db, user, [_line(lid, "영상 줄")], ["clip"])
    body = LineVisualRequest(line_index=0, line_id=lid, motion=MotionType.ZOOM_IN)
    res = await set_line_visual(body, job.id, db, user)
    assert res["motion"] == "zoom_in"


@pytest.mark.asyncio
async def test_transform_survives_split(env):
    db, user = env
    lid = new_line_id()
    tf = {"scale": 1.2, "x": 0.1, "y": 0.0}
    job = _job(db, user, [_line(lid, "긴 문장 하나", transform=tf)], ["image"])

    body = SplitLineRequest(line_index=0, before="긴 문장", after="하나")
    resp = await split_line(body, job.id, db, user)

    # 응답의 first 줄(ScriptLine 라운드트립)에 transform 이 보존되어야 한다.
    assert resp.lines[0].transform is not None
    assert resp.lines[0].transform.scale == pytest.approx(1.2)
    assert resp.lines[0].transform.x == pytest.approx(0.1)
    # 새로 생긴 second 줄은 transform 없음(기본 cover) + motion none.
    assert resp.lines[1].transform is None
    assert resp.lines[1].motion == MotionType.NONE
