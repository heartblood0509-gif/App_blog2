import asyncio
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import CHROME_PROFILES_DIR
from credentials import BrokerError, decrypt_pw_for_account
from routers.accounts import find_account
from utils.image_storage import tempdir_context

router = APIRouter()


# §D — 수동 발행 모드용 세션 레지스트리.
# 사용자가 Chrome 창을 닫거나 발행 완료 시 BrowserContext.on("close") 이벤트가
# disconnected=True 로 마킹. frontend 가 /publish/manual-status/{id} 폴링으로 확인.
_manual_sessions: dict[str, dict] = {}
_MANUAL_SESSION_TTL_SEC = 60 * 30  # 30분 후 자동 정리


def _cleanup_old_manual_sessions() -> None:
    now = time.time()
    expired = [k for k, v in _manual_sessions.items() if now - v.get("created_at", now) > _MANUAL_SESSION_TTL_SEC]
    for k in expired:
        _manual_sessions.pop(k, None)


class ImageSlotData(BaseModel):
    slot_id: str
    description: str
    group_id: Optional[str] = None
    pair_role: Optional[str] = None  # "first" | "second"
    base64: str
    mime_type: Optional[str] = None


class PublishRequest(BaseModel):
    title: str
    content: str
    account_id: str
    images: List[ImageSlotData] = []
    auto_publish: bool = False  # False면 글 작성만 하고 Chrome 열어둠
    force: bool = False  # True면 쿨다운 무시하고 강제 발행


class PublishResponse(BaseModel):
    success: bool
    message: str
    post_url: Optional[str] = None
    warning: Optional[str] = None
    today_count: Optional[int] = None
    image_failures: Optional[int] = None
    mode: Optional[str] = None  # "published" | "awaiting_manual_publish"
    manual_session_id: Optional[str] = None  # §D auto_publish=false 시에만 set


class ValidateResponse(BaseModel):
    ok: bool
    error_codes: List[str] = []


class ManualStatusResponse(BaseModel):
    disconnected: bool
    published: bool = False  # URL 변경으로 감지된 실제 발행 여부


class CooldownStatusResponse(BaseModel):
    remaining_sec: int  # 0이면 발행 가능
    last_publish_at: Optional[str] = None


@router.post("/", response_model=PublishResponse)
async def publish_to_naver(req: PublishRequest):
    """네이버 블로그 에디터에 글을 작성합니다."""
    account = find_account(req.account_id)
    if not account:
        raise HTTPException(404, f"등록되지 않은 계정입니다: {req.account_id}")

    # 쿨다운 가드 — force=true면 우회. 마지막 실제 발행 후 1시간 이내면 거부.
    if not req.force:
        from bots.naver_blog_publisher import _get_cooldown_remaining_sec
        remaining = _get_cooldown_remaining_sec()
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail={"code": "cooldown-active", "remaining_sec": remaining},
            )

    profile_path = f"{CHROME_PROFILES_DIR}/{account['id']}"

    # 이미지 슬롯을 임시 파일로 저장 (발행 종료 시 자동 정리)
    slot_dicts = [img.model_dump() for img in req.images]

    # §D 수동 발행 모드면 미리 session id 생성
    manual_session_id: Optional[str] = None
    on_manual_close = None
    on_manual_publish_detected = None
    if not req.auto_publish:
        manual_session_id = uuid.uuid4().hex
        _manual_sessions[manual_session_id] = {
            "created_at": time.time(),
            "disconnected": False,
            "published": False,
        }
        _cleanup_old_manual_sessions()

        def _mark_disconnected(_session_id: str = manual_session_id) -> None:
            entry = _manual_sessions.get(_session_id)
            if entry is not None:
                entry["disconnected"] = True

        def _mark_published(_session_id: str = manual_session_id) -> None:
            entry = _manual_sessions.get(_session_id)
            if entry is None or entry.get("published"):
                return  # 이미 카운트했거나 세션 만료 — 중복 방지.
            entry["published"] = True
            # 실제 발행 감지됨 → 카운터 증가 + last_publish_at 기록 (쿨다운 시작).
            try:
                from bots.naver_blog_publisher import _increment_counter, _load_counter
                _increment_counter(_load_counter())
            except Exception:
                pass

        on_manual_close = _mark_disconnected
        on_manual_publish_detected = _mark_published

    with tempdir_context(slot_dicts) as (tempdir, path_map):
        # publisher에 넘길 슬롯: base64 제거하고 path 주입
        image_slots = []
        for slot in slot_dicts:
            sid = slot["slot_id"]
            path = path_map.get(sid)
            if not path:
                continue
            image_slots.append({
                "slot_id": sid,
                "description": slot.get("description", ""),
                "group_id": slot.get("group_id"),
                "pair_role": slot.get("pair_role"),
                "path": str(path),
            })

        # §C — broker 로 비밀번호 복호화. plaintext 는 함수 스코프 변수로만.
        try:
            naver_pw_plain = decrypt_pw_for_account(account)
        except BrokerError as e:
            raise HTTPException(400, f"credential-decrypt-failed:{e}")

        try:
            from bots.naver_blog_publisher import NaverBlogPublisher

            publisher = NaverBlogPublisher()
            result = await publisher.publish(
                title=req.title,
                content=req.content,
                naver_id=account["naver_id"],
                naver_pw=naver_pw_plain,
                profile_path=profile_path,
                image_slots=image_slots if image_slots else None,
                auto_publish=req.auto_publish,
                on_manual_close=on_manual_close,
                on_manual_publish_detected=on_manual_publish_detected,
            )
            today_count = result.get("today_count")
            mode = result.get("mode")

            if mode == "awaiting_manual_publish":
                message = (
                    f"글 작성 완료. Chrome 창에서 직접 '발행' 버튼을 눌러주세요. "
                    f"({account['label']})"
                )
            else:
                message = f"네이버 블로그에 성공적으로 발행되었습니다. ({account['label']})"
                if today_count:
                    message += f" (오늘 {today_count}번째 발행)"

            return PublishResponse(
                success=True,
                message=message,
                post_url=result.get("url"),
                warning=result.get("warning"),
                today_count=today_count,
                image_failures=result.get("image_failures"),
                mode=mode,
                manual_session_id=manual_session_id if mode == "awaiting_manual_publish" else None,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/manual-status/{session_id}", response_model=ManualStatusResponse)
async def manual_status(session_id: str):
    """§D — 수동 발행 세션의 Chrome 닫힘 여부 + 실제 발행 여부. frontend 5초 폴링."""
    entry = _manual_sessions.get(session_id)
    if entry is None:
        # 만료되었거나 존재 안 함 — disconnected 처럼 취급해 frontend 가 busy 해제하도록.
        return ManualStatusResponse(disconnected=True, published=False)
    return ManualStatusResponse(
        disconnected=bool(entry.get("disconnected")),
        published=bool(entry.get("published")),
    )


@router.get("/cooldown-status", response_model=CooldownStatusResponse)
async def cooldown_status():
    """현재 쿨다운 남은 시간. 0이면 발행 가능. frontend가 마운트/30초 폴링."""
    from bots.naver_blog_publisher import _get_cooldown_remaining_sec, _load_counter
    data = _load_counter()
    return CooldownStatusResponse(
        remaining_sec=_get_cooldown_remaining_sec(),
        last_publish_at=data.get("last_publish_at"),
    )


@router.post("/validate", response_model=ValidateResponse)
async def validate_publish(req: PublishRequest):
    """§H — 발행 요청 dry-run. 실제 Playwright 로그인·발행 안 함.

    응답은 상수 error_codes 만. 상세는 backend.log 로.
    """
    import logging
    from pathlib import Path

    logger = logging.getLogger(__name__)
    account = find_account(req.account_id)
    if not account:
        return ValidateResponse(ok=False, error_codes=["account-not-found"])
    try:
        decrypt_pw_for_account(account)
    except BrokerError:
        logger.exception("validate decrypt failure for %s", req.account_id)
        return ValidateResponse(ok=False, error_codes=["credential-decrypt-failed"])
    profile_dir = Path(CHROME_PROFILES_DIR) / req.account_id
    try:
        profile_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        logger.exception("validate profile dir failure")
        return ValidateResponse(ok=False, error_codes=["profile-dir-error"])
    return ValidateResponse(ok=True, error_codes=[])


# asyncio import 사용 (불필요 경고 방지 — 향후 확장 시 활용 예정)
_ = asyncio
