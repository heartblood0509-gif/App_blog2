"""모션(줌) 속도 — 초당 rate 식 생성 + 클램프 헬퍼 + draft-meta 왕복 단위 테스트."""

import json
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.routes import preview as preview_module
from api.routes.preview import (
    apply_motion_speed,
    MOTION_SPEED_MIN,
    MOTION_SPEED_MAX,
)
from api.routes.jobs import update_draft_meta, UpdateDraftMetaRequest
from core.image_pipeline import (
    ken_burns_zoom_expr,
    zoom_crop,
    zoom_anchor,
    DEFAULT_ZOOM_RATE,
    ZOOM_MAX,
)
from db.database import Base
from db.models import Job, User
from core.user_assets_visual import new_line_id


# ── ken_burns_zoom_expr: 초당 rate 등속 식 ──────────────────────

def test_zoom_in_expr_uses_rate_per_frame():
    # 초당 rate 를 fps 로 나눈 값이 프레임당 증가량이어야 한다.
    expr = ken_burns_zoom_expr("zoom_in", 0.03, duration=4, fps=30)
    assert expr.startswith("min(1+")
    assert f"{0.03 / 30:.8f}" in expr      # 프레임당 0.001
    assert expr.endswith(f",{ZOOM_MAX})")   # 상한 클램프


def test_zoom_out_start_value_and_cap():
    # 짧은 줄: 시작값 z0 = 1 + rate*duration (상한 미만).
    short = ken_burns_zoom_expr("zoom_out", 0.0125, duration=4, fps=30)
    assert short.startswith("max(1.050000-")   # 1 + 0.0125*4 = 1.05
    assert short.endswith(",1.0)")
    # 긴 줄: z0 가 ZOOM_MAX 로 캡.
    long = ken_burns_zoom_expr("zoom_out", 0.0125, duration=100, fps=30)
    assert long.startswith(f"max({ZOOM_MAX:.6f}-")


def test_zoom_speed_is_duration_independent():
    # 같은 rate 면 클립 길이가 달라도 프레임당 증가량(속도)은 동일 → 짧은 줄이 빨라 보이던 문제 해소.
    short = ken_burns_zoom_expr("zoom_in", 0.0125, duration=2, fps=30)
    long = ken_burns_zoom_expr("zoom_in", 0.0125, duration=20, fps=30)
    rate_token = f"{0.0125 / 30:.8f}"
    assert rate_token in short
    assert rate_token in long


def test_pan_returns_fixed_zoom():
    # 팬(레거시)은 고정 배율 1.15 — rate 와 무관.
    assert ken_burns_zoom_expr("pan_left", 0.0125, duration=4, fps=30) == "1.15"
    assert ken_burns_zoom_expr("pan_up", 0.05, duration=1, fps=30) == "1.15"


def test_default_rate_matches_legacy_feel():
    # 기본 rate × 4초 = 총 5% (기존 "전체 5% 고정"과 동일 체감).
    assert DEFAULT_ZOOM_RATE * 4 == pytest.approx(0.05)


# ── zoom_crop / zoom_anchor: 앵커 기준 크롭(좌상단 쏠림 회귀 방지 + 미디어 중앙) ──

def test_zoom_crop_not_topleft_bug_form():
    # 앵커가 무엇이든 iw/ih 의존(좌상단 0 오프셋) 형태가 아니어야 한다.
    expr = zoom_crop("min(1.0+0.05*t,1.5)", 1080, 1920, 540, 960)
    flat = expr.replace(" ", "")
    assert "(iw-" not in flat and "(ih-" not in flat


def test_zoom_crop_frame_center_offset():
    # 프레임 중앙 앵커(540,960): 오프셋 = 540*(z-1), 960*(z-1).
    expr = zoom_crop("min(1.0+0.05*t,1.5)", 1080, 1920, 540, 960)
    assert "x='540.000*(min(1.0+0.05*t,1.5)-1)'" in expr
    assert "y='960.000*(min(1.0+0.05*t,1.5)-1)'" in expr


def test_zoom_crop_media_center_offset_follows_anchor():
    # 미디어를 오른쪽으로 옮겨 중앙이 864 면 crop x 오프셋도 864 기준.
    expr = zoom_crop("min(1.0+0.05*t,1.5)", 1080, 1920, 864, 960)
    assert "x='864.000*(" in expr


def test_zoom_anchor_follows_transform():
    # 기본 → 정중앙. x=0.3 → 오른쪽(864)으로 이동. y 는 그대로.
    assert zoom_anchor(None, 1080, 1920) == (540.0, 960.0)
    cx, cy = zoom_anchor({"scale": 0.5, "x": 0.3, "y": 0.0}, 1080, 1920)
    assert cx == pytest.approx(864.0)  # 540 + 0.3*1080
    assert cy == pytest.approx(960.0)


def test_zoom_anchor_clamps_offscreen_center():
    # 크게 옮겨 프레임 밖으로 나간 중앙은 [0,W]×[0,H] 로 클램프.
    cx, cy = zoom_anchor({"scale": 1.0, "x": 1.5, "y": -1.5}, 1080, 1920)
    assert cx == 1080.0  # 540 + 1.5*1080 = 2160 → 1080
    assert cy == 0.0     # 960 - 1.5*1920 = -1920 → 0


# ── apply_motion_speed: 클램프 + 방어 ──────────────────────────

def test_apply_motion_speed_clamps():
    job = SimpleNamespace(motion_speed=0.01)
    apply_motion_speed(job, 0.025)
    assert job.motion_speed == 0.025
    apply_motion_speed(job, 999)          # 상한
    assert job.motion_speed == MOTION_SPEED_MAX
    apply_motion_speed(job, 0.00001)      # 하한
    assert job.motion_speed == MOTION_SPEED_MIN


def test_apply_motion_speed_ignores_bad_values():
    # None / 문자열 / NaN 은 기존값 유지(무시).
    job = SimpleNamespace(motion_speed=0.0125)
    apply_motion_speed(job, None)
    assert job.motion_speed == 0.0125
    apply_motion_speed(job, "abc")
    assert job.motion_speed == 0.0125
    apply_motion_speed(job, float("nan"))
    assert job.motion_speed == 0.0125


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
async def test_draft_meta_saves_and_restores_motion_speed(env):
    db, user = env
    job = _job(db, user)

    body = UpdateDraftMetaRequest(motion_speed=0.025)
    resp = await update_draft_meta(body, job.id, db, user)
    assert resp.motion_speed == 0.025

    db.refresh(job)
    assert job.motion_speed == 0.025


@pytest.mark.asyncio
async def test_draft_meta_clamps_out_of_range(env):
    db, user = env
    job = _job(db, user)
    resp = await update_draft_meta(UpdateDraftMetaRequest(motion_speed=999), job.id, db, user)
    assert resp.motion_speed == MOTION_SPEED_MAX
