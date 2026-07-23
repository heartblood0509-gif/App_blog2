"""음성 설정 편집 즉시 저장 — draft-meta 왕복 테스트.

배경: 예전에는 성우/감정/속도/세션이 confirm(영상 만들기) 때만 job 에 저장됐다.
그래서 렌더 전에 중단한 작업을 '이전 작업'에서 다시 열면 voice_id 가 NULL 이라
프론트가 목록 첫 성우(혜리)로 폴백했고, 만들어 둔 음성 세션도 잃어 전 줄이 재합성됐다.
제목·자막과 동일한 '편집 즉시 저장' 정책으로 맞춘 것을 여기서 고정한다.
"""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.routes import preview as preview_module
from api.routes.jobs import update_draft_meta, UpdateDraftMetaRequest
from core.user_assets_visual import new_line_id
from db.database import Base
from db.models import Job, User

CHANGSU = "tc_6059dad0b83880769a50502f"  # 창수 (남성)


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


def _job(db, user, **kw):
    """카드 B draft — /api/jobs/draft 가 만드는 상태(음성 미설정)와 동일."""
    lines = [{
        "line_id": new_line_id(), "text": "첫 줄", "image_prompt": "",
        "motion": "none", "asset_version": 1, "status": "ready",
    }]
    job = Job(
        id="testjob01234",
        user_id=user.id,
        status="preview_ready",
        generation_mode="user_assets",
        script_json=json.dumps(lines, ensure_ascii=False),
        line_sources_json=json.dumps(["image"]),
        **kw,
    )
    db.add(job)
    db.commit()
    return job


@pytest.mark.asyncio
async def test_saves_voice_before_confirm(env):
    # 이 버그의 본체: 렌더 없이 성우만 고른 상태가 job 에 남아야 한다.
    db, user = env
    job = _job(db, user)
    assert job.voice_id is None  # draft 생성 직후엔 비어 있다

    resp = await update_draft_meta(
        UpdateDraftMetaRequest(
            tts_engine="typecast", voice_id=CHANGSU, emotion="normal", tts_speed=1.2,
        ),
        job.id, db, user,
    )
    assert resp.voice_id == CHANGSU
    assert resp.tts_engine == "typecast"
    assert resp.emotion == "normal"
    assert resp.tts_speed == 1.2

    db.refresh(job)
    assert job.voice_id == CHANGSU


@pytest.mark.asyncio
async def test_saves_tts_session_id(env):
    # 만들어 둔 음성 세션도 남아야 재열기 때 재합성(크레딧 소모) 없이 복원된다.
    db, user = env
    job = _job(db, user)
    resp = await update_draft_meta(
        UpdateDraftMetaRequest(voice_id=CHANGSU, tts_session_id="a1b2c3d4e5f6"),
        job.id, db, user,
    )
    assert resp.tts_session_id == "a1b2c3d4e5f6"


@pytest.mark.asyncio
async def test_rejects_malformed_session_id(env):
    # 세션 폴더명으로 그대로 쓰이는 값 — 형식 밖이면 무시하고 기존값 유지(경로 조작 방어).
    db, user = env
    job = _job(db, user, tts_session_id="a1b2c3d4e5f6")
    for bad in ("../../etc", "ZZZZZZZZZZZZ", "a1b2c3", ""):
        await update_draft_meta(UpdateDraftMetaRequest(tts_session_id=bad), job.id, db, user)
        db.refresh(job)
        assert job.tts_session_id == "a1b2c3d4e5f6"


@pytest.mark.asyncio
async def test_unknown_engine_falls_back_to_typecast(env):
    # confirm 과 동일한 화이트리스트 방어.
    db, user = env
    job = _job(db, user)
    resp = await update_draft_meta(UpdateDraftMetaRequest(tts_engine="bogus"), job.id, db, user)
    assert resp.tts_engine == "typecast"


@pytest.mark.asyncio
async def test_engine_switch_clears_stale_elevenlabs_options(env):
    # tts_options 는 tts_engine 과 한 쌍으로만 반영된다 → Typecast 로 되돌리면 옛 EL 옵션이 지워진다.
    db, user = env
    job = _job(db, user)
    opts = {"model_id": "eleven_v3", "stability": 1, "similarity_boost": 0.8, "style": 0}
    resp = await update_draft_meta(
        UpdateDraftMetaRequest(tts_engine="elevenlabs", voice_id="el_voice", tts_options=opts),
        job.id, db, user,
    )
    assert resp.tts_options == opts

    resp = await update_draft_meta(
        UpdateDraftMetaRequest(tts_engine="typecast", voice_id=CHANGSU, tts_options=None),
        job.id, db, user,
    )
    assert resp.tts_options is None


@pytest.mark.asyncio
async def test_empty_voice_id_normalized_to_null(env):
    # ElevenLabs 음성 미선택은 ""(빈 문자열)로 온다 → NULL 로 저장.
    db, user = env
    job = _job(db, user, voice_id=CHANGSU)
    await update_draft_meta(UpdateDraftMetaRequest(voice_id=""), job.id, db, user)
    db.refresh(job)
    assert job.voice_id is None


@pytest.mark.asyncio
async def test_omitted_fields_keep_existing_voice(env):
    # 자막 스타일만 저장하는 기존 호출이 성우를 지우면 안 된다(미변경 필드는 그대로).
    db, user = env
    job = _job(db, user, voice_id=CHANGSU, tts_engine="typecast", emotion="happy")
    await update_draft_meta(UpdateDraftMetaRequest(subtitle_font_size=60), job.id, db, user)
    db.refresh(job)
    assert job.voice_id == CHANGSU
    assert job.emotion == "happy"


@pytest.mark.asyncio
async def test_rejected_outside_edit_stage(env):
    # 렌더 시작 후 늦게 도착한 디바운스 저장이 확정된 값을 덮지 않도록 409.
    from fastapi import HTTPException

    db, user = env
    job = _job(db, user)
    job.status = "awaiting_confirmation"
    db.commit()
    with pytest.raises(HTTPException) as e:
        await update_draft_meta(UpdateDraftMetaRequest(voice_id=CHANGSU), job.id, db, user)
    assert e.value.status_code == 409
