"""레이아웃(꽉 채움 / 상·하단 검정 박스) — 클램프 헬퍼 + drawbox 필터 + draft-meta 왕복 단위 테스트."""

import json
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.routes import preview as preview_module
from api.routes.preview import apply_layout_mode
from api.routes.jobs import update_draft_meta, UpdateDraftMetaRequest
from core.video_assembler import (
    build_layout_filters,
    LAYOUT_BOX_TOP_H,
    LAYOUT_BOX_BOTTOM_Y,
    LAYOUT_BOX_BOTTOM_H,
)
from db.database import Base
from db.models import Job, User
from core.user_assets_visual import new_line_id


# ── apply_layout_mode: "boxed"만 저장 / 그 외=해제 / None=미변경 ──

def test_apply_layout_mode_saves_boxed():
    job = SimpleNamespace(layout_mode=None)
    apply_layout_mode(job, "boxed")
    assert job.layout_mode == "boxed"
    # 공백·대소문자 정규화
    job.layout_mode = None
    apply_layout_mode(job, "  BOXED ")
    assert job.layout_mode == "boxed"


def test_apply_layout_mode_full_clears_to_none():
    # 다른 apply_* 와 달리 "그 외 값(=full 포함)"은 무시가 아니라 해제(None).
    job = SimpleNamespace(layout_mode="boxed")
    apply_layout_mode(job, "full")
    assert job.layout_mode is None
    # 알 수 없는 값도 해제.
    job.layout_mode = "boxed"
    apply_layout_mode(job, "weird")
    assert job.layout_mode is None


def test_apply_layout_mode_none_keeps_current():
    # None(=키 없음)은 미변경.
    job = SimpleNamespace(layout_mode="boxed")
    apply_layout_mode(job, None)
    assert job.layout_mode == "boxed"


# ── build_layout_filters: drawbox 2개 / 그 외 빈 리스트 ──────────

def test_build_layout_filters_boxed():
    fs = build_layout_filters("boxed")
    assert len(fs) == 2
    assert fs[0] == f"drawbox=x=0:y=0:w=iw:h={LAYOUT_BOX_TOP_H}:color=black:t=fill"
    assert fs[1] == f"drawbox=x=0:y={LAYOUT_BOX_BOTTOM_Y}:w=iw:h={LAYOUT_BOX_BOTTOM_H}:color=black:t=fill"


def test_build_layout_filters_empty_for_non_boxed():
    assert build_layout_filters(None) == []
    assert build_layout_filters("") == []
    assert build_layout_filters("full") == []


def test_layout_box_geometry_covers_full_height():
    # 상단 박스 + 가운데 밴드(976) + 하단 박스 = 1920. 프리뷰 도식과 정합.
    assert LAYOUT_BOX_TOP_H + 976 == LAYOUT_BOX_BOTTOM_Y
    assert LAYOUT_BOX_BOTTOM_Y + LAYOUT_BOX_BOTTOM_H == 1920


# ── draft-meta 왕복 (편집 즉시 저장 + draft-state 복원) ──────────

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


def _job(db, user):
    lid = new_line_id()
    lines = [{
        "line_id": lid, "text": "첫 줄", "image_prompt": "",
        "motion": "none", "asset_version": 1, "status": "ready",
    }]
    job = Job(
        id="testjob01234",
        user_id=user.id,
        status="preview_ready",
        generation_mode="user_assets",
        script_json=json.dumps(lines, ensure_ascii=False),
        line_sources_json=json.dumps(["image"]),
    )
    db.add(job)
    db.commit()
    return job


@pytest.mark.asyncio
async def test_draft_meta_saves_and_restores_boxed(env):
    db, user = env
    job = _job(db, user)

    resp = await update_draft_meta(UpdateDraftMetaRequest(layout_mode="boxed"), job.id, db, user)
    assert resp.layout_mode == "boxed"
    db.refresh(job)
    assert job.layout_mode == "boxed"


@pytest.mark.asyncio
async def test_draft_meta_full_clears_boxed(env):
    db, user = env
    job = _job(db, user)
    # 먼저 boxed 저장.
    await update_draft_meta(UpdateDraftMetaRequest(layout_mode="boxed"), job.id, db, user)
    # 이어서 "full" 전송 → 해제(None)되어야 재열기 시 꽉 채움으로 복원됨.
    resp = await update_draft_meta(UpdateDraftMetaRequest(layout_mode="full"), job.id, db, user)
    assert resp.layout_mode is None
    db.refresh(job)
    assert job.layout_mode is None
