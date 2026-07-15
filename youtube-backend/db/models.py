"""SQLAlchemy ORM 모델"""

from sqlalchemy import Column, String, Float, Text, DateTime, Index, Boolean, Integer
from sqlalchemy.orm import declarative_base
import uuid
from core.time_utils import utc_now_naive

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    email = Column(String, unique=True, nullable=False, index=True)
    nickname = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    role = Column(String, default="user")
    provider = Column(String, default="email")
    provider_id = Column(String, nullable=True)
    approved = Column(Boolean, default=False)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    gemini_api_key_enc = Column(String, nullable=True)
    typecast_api_key_enc = Column(String, nullable=True)
    elevenlabs_api_key_enc = Column(String, nullable=True)
    fal_key_enc = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)


class PreApprovedEmail(Base):
    __tablename__ = "pre_approved_emails"

    email = Column(String, primary_key=True)
    created_at = Column(DateTime, default=utc_now_naive)
    created_by_user_id = Column(String, nullable=True)


class UserBgm(Base):
    __tablename__ = "user_bgms"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex[:12])
    user_id = Column(String, nullable=False, index=True)
    filename = Column(String, nullable=False)
    duration = Column(Float, default=0.0)
    r2_key = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now_naive)


class UserProduct(Base):
    __tablename__ = "user_products"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex[:12])
    user_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    r2_key = Column(String, default="")
    created_at = Column(DateTime, default=utc_now_naive)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex[:12])
    user_id = Column(String, nullable=True, index=True)
    status = Column(String, default="pending")
    progress = Column(Float, default=0.0)
    current_step = Column(String, default="")

    # 입력 파라미터
    topic = Column(Text, default="")
    style = Column(String, default="realistic")
    video_mode = Column(String, default="kenburns")
    tts_engine = Column(String, default="typecast")
    tts_speed = Column(Float, default=1.1)
    voice_id = Column(String, nullable=True)
    emotion = Column(String, nullable=True)
    # 엔진별 추가 음성 설정 JSON. None=typecast(감정 프리셋). ElevenLabs 예:
    # {"model_id":"eleven_multilingual_v2","stability":0.5,"similarity_boost":0.75,"style":0.0}
    tts_options_json = Column(Text, nullable=True)
    title = Column(Text, default="")
    title_line1 = Column(String, nullable=True)
    title_line2 = Column(String, nullable=True)
    # 제목 폰트 id + 굵기 id(core.fonts.BUNDLED_TITLE_FONTS) + 크기(px, 1080폭 기준).
    # None=기본(프리텐다드·ExtraBold·120).
    title_font = Column(String, nullable=True)
    title_font_weight = Column(String, nullable=True)
    title_font_size = Column(Integer, nullable=True)
    # 제목 줄별 글자 크기(px, 1080폭). None=title_font_size 폴백(두 줄 단일 크기, 레거시 불변).
    title_line1_size = Column(Integer, nullable=True)
    title_line2_size = Column(Integer, nullable=True)
    # 첫줄↔둘째줄 세로 간격(top-to-top, px, 1080폭). None=기존 round(130*size/120) 공식.
    title_line_gap = Column(Integer, nullable=True)
    # 제목 줄별 색(#RRGGBB). None=기본(윗줄 #FFFFFF, 아랫줄 #E8D44D).
    title_color1 = Column(String, nullable=True)
    title_color2 = Column(String, nullable=True)
    # 제목 위치 오프셋(px). dx=가로 중앙 오프셋(1080폭), dy=기본 위치 기준 세로 델타(1920높이).
    # None/0=기존 고정 위치. 자막(subtitle_y=절대 y)과 달리 델타 — 기본 세로 위치가 렌더 시
    # 폰트 크기로 계산되므로(video_assembler) 그 공식을 중복하지 않기 위해서다.
    title_dx = Column(Integer, nullable=True)
    title_dy = Column(Integer, nullable=True)
    # 자막 스타일(작업 전역, 모든 줄 공통). 폰트/굵기 id 는 제목과 같은 core.fonts.BUNDLED_TITLE_FONTS.
    # None=기본(번들 기본 자막폰트·55px·흰색). 위치: dx=가로 중앙 오프셋(px, 1080폭), y=자막 상단 y(px, 1920높이).
    subtitle_font = Column(String, nullable=True)
    subtitle_font_weight = Column(String, nullable=True)
    subtitle_font_size = Column(Integer, nullable=True)
    subtitle_color = Column(String, nullable=True)
    subtitle_dx = Column(Integer, nullable=True)
    subtitle_y = Column(Integer, nullable=True)
    # 줌(모션) 속도 — 작업 전역, 모든 줄 공통. 초당 확대 비율(0.0125=1.25%/s). None=기본.
    motion_speed = Column(Float, nullable=True)
    # 레이아웃(작업 전역). None=꽉 채움(기존 동작), "boxed"=상·하단 검정 박스, "blur"=흐림 배경
    # (빈 공간을 같은 미디어의 가우시안 블러로 채움 — 캡컷 방식). boxed 는 전역 drawbox,
    # blur 는 줄별 합성 단계에서 처리한다.
    layout_mode = Column(String, nullable=True)
    # 흐림 배경 강도(가우시안 sigma). None=기본(25). blur 모드에서만 의미. 5~50 클램프.
    layout_blur_sigma = Column(Float, nullable=True)
    script_json = Column(Text, default="[]")
    # 카드 A("AI가 모두 생성")는 "ai_full", 카드 B("사용자 직접 제공")는 "user_assets"
    generation_mode = Column(String, default="ai_full")
    # 줄별 자산 출처: ["ai"|"image"|"clip", ...] (길이 == 줄 개수). 카드 B에서만 사용.
    line_sources_json = Column(Text, default="[]")
    # 카드 B 전용: 전체 대본에서 추론한 visual bible + line_id 기반 shot plan.
    visual_plan_json = Column(Text, default="")
    product_image_id = Column(String, nullable=True)
    bgm_volume = Column(Float, default=0.12)
    bgm_filename = Column(String, nullable=True)
    bgm_start_sec = Column(Float, default=0.0)

    # 음성 단계에서 사전 생성한 TTS 세션 ID (있으면 영상 조립 시 재사용)
    tts_session_id = Column(String, nullable=True)

    # 출력
    video_path = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    # R2 동기화
    r2_synced = Column(String, default="none")
    files_expired_at = Column(DateTime, nullable=True)

    # 카드 B: 완료 후 사용자가 "다운로드/새 영상"을 누르기 전까지 중간 산출물(images/clips/tts/temp) 보존 여부.
    # 기본 True → 기존 완료 job은 backfill로 "편집 불가" 상태. 신규 완료 job만 worker가 False로 SET.
    intermediates_purged = Column(Boolean, default=True, nullable=False)

    # 카드 B 재제작 시 변경 감지용: 직전 render의 voice 시그니처 + line_id 순서 + line_id별 text_hash JSON.
    last_render_signature = Column(Text, nullable=True)

    # 시간
    created_at = Column(DateTime, default=utc_now_naive)
    completed_at = Column(DateTime, nullable=True)


class JobTask(Base):
    __tablename__ = "job_tasks"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex[:12])
    job_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=True, index=True)
    kind = Column(String, nullable=False, index=True)
    dedupe_key = Column(String, nullable=True, index=True)
    status = Column(String, default="queued", index=True)
    payload_json = Column(Text, default="{}")
    attempt_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=80)
    next_run_at = Column(DateTime, nullable=True, index=True)
    locked_by = Column(String, nullable=True, index=True)
    locked_until = Column(DateTime, nullable=True, index=True)
    heartbeat_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
