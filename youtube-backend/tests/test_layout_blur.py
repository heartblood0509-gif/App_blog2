"""흐림 배경(blur 레이아웃) — fit 수식·강도 클램프·ffmpeg 체인·fit-all 엔드포인트 단위 테스트."""

import json
import os
from types import SimpleNamespace

import pytest
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.routes import preview as preview_module
from api.routes.preview import (
    apply_layout_mode,
    apply_blur_sigma,
    layout_fit_transforms,
    LayoutFitRequest,
    BLUR_SIGMA_MIN,
    BLUR_SIGMA_MAX,
)
from core.image_pipeline import (
    fit_transform,
    placement_covers_frame,
    build_user_clip_place_chain,
    SCALE_MIN,
)
from core.video_assembler import build_layout_filters
from db.database import Base
from db.models import Job, User
from core.user_assets_visual import new_line_id, line_asset_rel


# ── apply_layout_mode: blur 저장 / full 해제 / boxed 회귀 ──

def test_apply_layout_mode_blur():
    job = SimpleNamespace(layout_mode=None)
    apply_layout_mode(job, "blur")
    assert job.layout_mode == "blur"
    apply_layout_mode(job, "full")  # 그 외=해제
    assert job.layout_mode is None
    apply_layout_mode(job, "boxed")  # 회귀
    assert job.layout_mode == "boxed"


# ── apply_blur_sigma: 클램프 + 방어 ──

def test_apply_blur_sigma_clamps():
    job = SimpleNamespace(layout_blur_sigma=25.0)
    apply_blur_sigma(job, 30)
    assert job.layout_blur_sigma == 30
    apply_blur_sigma(job, 999)
    assert job.layout_blur_sigma == BLUR_SIGMA_MAX
    apply_blur_sigma(job, 0.1)
    assert job.layout_blur_sigma == BLUR_SIGMA_MIN


def test_apply_blur_sigma_ignores_bad():
    job = SimpleNamespace(layout_blur_sigma=25.0)
    apply_blur_sigma(job, None)
    apply_blur_sigma(job, "abc")
    apply_blur_sigma(job, float("nan"))
    assert job.layout_blur_sigma == 25.0


# ── fit_transform: contain 배율 (프론트 fitScale 과 동일 수치) ──

def test_fit_transform_landscape():
    # 1920×1080 가로 영상을 1080×1920 세로 프레임에: fit=1080/1920, base=1920/1080 → 0.31640625
    t = fit_transform(1920, 1080, 1080, 1920)
    assert t["x"] == 0.0 and t["y"] == 0.0
    assert t["scale"] == pytest.approx(0.31640625)


def test_fit_transform_square():
    # 1000×1000: fit=1080/1000, base=1920/1000 → 0.5625
    assert fit_transform(1000, 1000, 1080, 1920)["scale"] == pytest.approx(0.5625)


def test_fit_transform_nine_sixteen_is_cover():
    # 9:16 원본은 fit==cover==1.0
    assert fit_transform(1080, 1920, 1080, 1920)["scale"] == pytest.approx(1.0)
    assert fit_transform(864, 1536, 1080, 1920)["scale"] == pytest.approx(1.0)


def test_fit_transform_extreme_panorama_clamps():
    # 초광각 파노라마는 SCALE_MIN 으로 클램프(완전 contain 불가, 알려진 한계).
    assert fit_transform(10000, 500, 1080, 1920)["scale"] == SCALE_MIN


# ── placement_covers_frame ──

def test_placement_covers_frame():
    cover = {"scale": 1.0, "x": 0.0, "y": 0.0}
    assert placement_covers_frame(1080, 1920, cover, 1080, 1920) is True
    # fit(가로영상)은 프레임을 다 못 덮음
    fit = fit_transform(1920, 1080, 1080, 1920)
    assert placement_covers_frame(1920, 1080, fit, 1080, 1920) is False


# ── build_user_clip_place_chain ──

def test_place_chain_no_blur_is_legacy():
    # sigma 없으면 기존 검정 배경 문자열과 동일(회귀 고정).
    chain = build_user_clip_place_chain(540, 960, 100, 200, 1080, 1920, 30, 4.0, blur_sigma=None)
    assert chain == (
        "color=c=black:s=1080x1920:r=30:d=4.0[bg];"
        "[0:v]scale=540:960:flags=lanczos,setsar=1,setpts=PTS-STARTPTS[fg];"
        "[bg][fg]overlay=100:200:shortest=1"
    )


def test_place_chain_blur_has_split_and_gblur():
    chain = build_user_clip_place_chain(540, 960, 100, 200, 1080, 1920, 30, 4.0, blur_sigma=25.0)
    assert "split=2[bsrc][fsrc]" in chain
    assert "gblur=sigma=6.250" in chain  # 25/4, ¼ 해상도 보정
    assert "scale=270:480:force_original_aspect_ratio=increase,crop=270:480" in chain
    assert chain.endswith("overlay=100:200:shortest=1")  # zoom_in 접합용 라벨 없는 overlay


# ── build_layout_filters: blur 는 전역 필터 없음(줄별 처리) ──

def test_build_layout_filters_blur_empty():
    assert build_layout_filters("blur") == []
    assert len(build_layout_filters("boxed")) == 2  # 회귀


# ── fit-all 엔드포인트 왕복 ──

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
    yield db, user, str(storage_root)
    db.close()


def _make_ready_job(db, user, storage_root, ready_line, sources=None):
    """ready 줄 1개 + 대기 줄 1개짜리 카드 B 작업 + ready 줄 이미지(가로 1920×1080) 파일 생성."""
    pending_id = new_line_id()
    lines = [
        ready_line,
        {"line_id": pending_id, "text": "대기 줄", "motion": "none", "asset_version": 0, "status": "pending"},
    ]
    job = Job(
        id="testjob01234", user_id=user.id, status="preview_ready",
        generation_mode="user_assets",
        script_json=json.dumps(lines, ensure_ascii=False),
        line_sources_json=json.dumps(sources or ["image", "image"]),
    )
    db.add(job)
    db.commit()
    rel = line_asset_rel("image", ready_line, 0)
    abs_path = os.path.join(storage_root, job.id, rel)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    Image.new("RGB", (1920, 1080), (10, 20, 30)).save(abs_path, "PNG")
    return job, ready_line["line_id"], pending_id


@pytest.mark.asyncio
async def test_layout_fit_blur_fits_untouched(env, monkeypatch):
    """blur 선택 → 안 건드린 준비 줄은 fit(contain), 미준비 줄은 스킵."""
    db, user, storage_root = env
    job, ready_id, pending_id = _make_ready_job(
        db, user, storage_root,
        {"line_id": new_line_id(), "text": "준비된 줄", "motion": "none", "asset_version": 1, "status": "ready"},
    )
    monkeypatch.setattr(preview_module, "probe_media_dims", lambda p: (1920, 1080))
    resp = await layout_fit_transforms(LayoutFitRequest(mode="blur"), job.id, db, user)
    ready = next(l for l in resp.lines if l.line_id == ready_id)
    pending = next(l for l in resp.lines if l.line_id == pending_id)
    assert ready.transform.scale == pytest.approx(0.31640625)  # fit(1920×1080)
    assert pending.transform is None  # 미준비 줄은 건너뜀


@pytest.mark.asyncio
async def test_layout_fit_full_pops_autofit(env, monkeypatch):
    """full 선택 → 이전에 auto-fit 됐던(수동 아님) 줄의 transform 제거 = cover 복귀."""
    db, user, storage_root = env
    fit = fit_transform(1920, 1080, 1080, 1920)
    job, ready_id, _ = _make_ready_job(
        db, user, storage_root,
        {"line_id": new_line_id(), "text": "준비된 줄", "motion": "none", "asset_version": 1,
         "status": "ready", "transform": fit},
    )
    monkeypatch.setattr(preview_module, "probe_media_dims", lambda p: (1920, 1080))
    resp = await layout_fit_transforms(LayoutFitRequest(mode="full"), job.id, db, user)
    ready = next(l for l in resp.lines if l.line_id == ready_id)
    assert ready.transform is None  # full → cover(부재)


@pytest.mark.asyncio
async def test_layout_fit_skips_manual(env, monkeypatch):
    """transform_manual=True 인 줄은 blur 선택해도 fit 으로 안 바뀜(손댐 존중)."""
    db, user, storage_root = env
    job, ready_id, _ = _make_ready_job(
        db, user, storage_root,
        {"line_id": new_line_id(), "text": "준비된 줄", "motion": "none", "asset_version": 1,
         "status": "ready", "transform": {"scale": 1.0, "x": 0.0, "y": 0.0}, "transform_manual": True},
    )
    monkeypatch.setattr(preview_module, "probe_media_dims", lambda p: (1920, 1080))
    resp = await layout_fit_transforms(LayoutFitRequest(mode="blur"), job.id, db, user)
    ready = next(l for l in resp.lines if l.line_id == ready_id)
    assert ready.transform.scale == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_layout_fit_protects_legacy_manual(env, monkeypatch):
    """플래그 없는 옛 수동 배치(≠default, ≠fit)는 blur 선택해도 보존(레거시 휴리스틱)."""
    db, user, storage_root = env
    job, ready_id, _ = _make_ready_job(
        db, user, storage_root,
        {"line_id": new_line_id(), "text": "준비된 줄", "motion": "none", "asset_version": 1,
         "status": "ready", "transform": {"scale": 2.0, "x": 0.3, "y": 0.0}},
    )
    monkeypatch.setattr(preview_module, "probe_media_dims", lambda p: (1920, 1080))
    resp = await layout_fit_transforms(LayoutFitRequest(mode="blur"), job.id, db, user)
    ready = next(l for l in resp.lines if l.line_id == ready_id)
    assert ready.transform.scale == pytest.approx(2.0)
