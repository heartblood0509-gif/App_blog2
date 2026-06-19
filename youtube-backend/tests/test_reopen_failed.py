"""카드 B 렌더 실패(failed) 후 편집 복귀(reopen) 게이트 단위 테스트.

배경: 카드 B 영상 제작이 렌더 단계에서 실패하면(예: 업로드 영상이 음성보다 짧음) job.status가
'failed'가 된다. 과거엔 reopen 허용 조건이 completed/preview_ready만 인정해 실패한 작업은 편집
화면으로 못 돌아갔다(실사용자 문의). 자산은 보존돼 있으므로(intermediates_purged=False) failed도
허용해 자산만 교체 후 재제작할 수 있어야 한다.

검증:
- can_reopen: failed + user_assets + 미정리 → True / ai_full·정리됨·비terminal → False
- reopen_job: failed → preview_ready 전환 + error_message 초기화
- reopen_job: 활성 task 있으면 409
- 회귀: completed 작업의 reopen 동작 유지
"""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.routes import jobs as jobs_module
from api.routes.jobs import _job_to_response, reopen_job
from core.user_assets_visual import new_line_id
from db.database import Base
from db.models import Job, JobTask, User


# ── fixtures ──────────────────────────────────────────────


@pytest.fixture
def env(tmp_path, monkeypatch):
    """임시 storage + 임시 SQLite + 사용자 1명."""
    storage_root = tmp_path / "storage"
    storage_root.mkdir()
    # jobs 라우트는 settings.STORAGE_DIR를 직접 참조한다(공유 settings 싱글턴).
    monkeypatch.setattr(jobs_module.settings, "STORAGE_DIR", str(storage_root))

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()

    user = User(
        id="testuser0001",
        email="test@example.com",
        nickname="tester",
        approved=True,
    )
    db.add(user)
    db.commit()

    yield storage_root, db, user
    db.close()


def _make_job(
    db,
    user,
    *,
    status="failed",
    mode="user_assets",
    purged=False,
    job_id="abc123abc123",
    line_id=None,
    error_message="영상 조립 실패: 1번째 줄 영상이 음성보다 짧습니다",
):
    line_id = line_id or new_line_id()
    lines = [{"line_id": line_id, "text": "한 줄", "status": "ready"}]
    job = Job(
        id=job_id,
        user_id=user.id,
        status=status,
        generation_mode=mode,
        script_json=json.dumps(lines, ensure_ascii=False),
        line_sources_json=json.dumps(["image"]),
        intermediates_purged=purged,
        tts_session_id=None,
        error_message=error_message,
    )
    db.add(job)
    db.commit()
    return job, line_id


def _write_image_for_line(storage_root, job_id, line_id):
    """images/line_{line_id}.png — line_asset_rel_candidates('image', line) 경로와 일치."""
    p = storage_root / job_id / "images" / f"line_{line_id}.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"\x89PNG\r\n\x1a\n" + b"fake")
    return p


# ── can_reopen 게이트 ─────────────────────────────────────


def test_can_reopen_true_for_failed_user_assets(env):
    _, db, user = env
    job, _ = _make_job(db, user, status="failed")
    assert _job_to_response(job).can_reopen is True


def test_can_reopen_true_for_completed_user_assets(env):
    """회귀: 완료 작업의 reopen 노출이 유지돼야 한다."""
    _, db, user = env
    job, _ = _make_job(db, user, status="completed")
    assert _job_to_response(job).can_reopen is True


def test_can_reopen_false_when_purged(env):
    _, db, user = env
    job, _ = _make_job(db, user, status="failed", purged=True)
    assert _job_to_response(job).can_reopen is False


def test_can_reopen_false_for_ai_full(env):
    _, db, user = env
    job, _ = _make_job(db, user, status="failed", mode="ai_full")
    assert _job_to_response(job).can_reopen is False


def test_can_reopen_false_for_non_terminal_status(env):
    """진행 중(generating_images 등)은 reopen 대상이 아니다."""
    _, db, user = env
    job, _ = _make_job(db, user, status="generating_images")
    assert _job_to_response(job).can_reopen is False


# ── reopen_job 라우트 ─────────────────────────────────────


@pytest.mark.asyncio
async def test_reopen_failed_job_flips_to_preview_ready(env):
    storage_root, db, user = env
    job, line_id = _make_job(db, user, status="failed")
    _write_image_for_line(storage_root, job.id, line_id)

    res = await reopen_job(job.id, db, user)

    db.refresh(job)
    assert job.status == "preview_ready"
    assert job.error_message is None
    assert res.status == "preview_ready"


@pytest.mark.asyncio
async def test_reopen_blocked_by_active_task(env):
    storage_root, db, user = env
    job, line_id = _make_job(db, user, status="failed")
    _write_image_for_line(storage_root, job.id, line_id)
    db.add(
        JobTask(
            id="task00000001",
            job_id=job.id,
            user_id=user.id,
            kind="render_video",
            status="running",
        )
    )
    db.commit()

    with pytest.raises(HTTPException) as exc:
        await reopen_job(job.id, db, user)
    assert exc.value.status_code == 409
