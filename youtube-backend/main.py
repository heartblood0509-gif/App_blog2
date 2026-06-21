"""YouTube Shorts 자동 제작 웹앱 - FastAPI 진입점"""

from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from contextlib import asynccontextmanager
from db.database import init_db
from api.routes import generate, jobs, preview, assets, tts_preview, auth, admin, products
from api.routes.assets import bgm_router
from auth import verify_app_token
from config import settings
import logging
import os
import sys
import asyncio

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # JWT_SECRET 필수 체크
    if not settings.JWT_SECRET or settings.JWT_SECRET == "your-secret-key-change-this":
        raise RuntimeError(
            "\n\n  [오류] JWT_SECRET이 설정되지 않았습니다!\n"
            "  .env 파일에서 JWT_SECRET 값을 안전한 랜덤 문자열로 변경하세요.\n"
            "  생성 방법: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
        )

    # 시작 시 초기화
    init_db()

    # 백필: 과거 버전에서 intermediates_purged 기본값(True) 때문에 작업이력 재진입이
    # 막힌 카드 B '편집 중' 작업을 복구. 실패해도 서버 기동은 막지 않는다.
    try:
        from db.database import repair_card_b_preview_ready_purged
        _repaired = repair_card_b_preview_ready_purged()
        if _repaired:
            logging.info(f"[startup] '편집 중' 작업 재진입 복구: {_repaired}건")
    except Exception as e:
        logging.warning(f"[startup] intermediates_purged 백필 실패(무시): {e}")

    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    os.makedirs(settings.BGM_DIR, exist_ok=True)

    # 로컬 단일 사용자 모드: 고정 계정 생성 + Electron env 키 시드.
    if settings.LOCAL_SINGLE_USER:
        from db.database import SessionLocal
        from core.local_user import get_or_create_local_user
        _db = SessionLocal()
        try:
            get_or_create_local_user(_db)
        finally:
            _db.close()

    from jobs_queue.task_worker import task_worker_loop

    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(task_worker_loop(stop_event))
    app.state.task_worker_stop = stop_event
    app.state.task_worker_task = worker_task
    print(f"\n  AI 쇼츠 자동 제작 웹앱 시작!")
    print(f"  http://localhost:8000\n")
    try:
        yield
    finally:
        stop_event.set()
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


def _bootstrap_security_env() -> None:
    """임베드(LOCAL_SINGLE_USER) 모드에서 APP_TOKEN 누락을 부팅 단계에서 fail-closed.

    blog 백엔드(backend/main.py _bootstrap_security_env)와 동일 정책. standalone(멀티유저)
    기동엔 APP_TOKEN 이 필요 없으므로 임베드 모드에서만 검사한다. dev 는 ALLOW_INSECURE_DEV_AUTH=1
    로 우회. "health 는 200 인데 기능 API 만 401/500" 인 반쪽 기동을 미리 차단한다.
    (youtube-backend 는 credential broker 를 안 쓰므로 APP_TOKEN 만 검사.)
    """
    if not settings.LOCAL_SINGLE_USER:
        return
    if not os.environ.get("APP_TOKEN"):
        if os.environ.get("ALLOW_INSECURE_DEV_AUTH") == "1":
            print("\033[33m[WARN] INSECURE DEV MODE: APP_TOKEN unset\033[0m", file=sys.stderr)
        else:
            print(
                "\033[31m[FATAL] APP_TOKEN env is required (LOCAL_SINGLE_USER). "
                "Set ALLOW_INSECURE_DEV_AUTH=1 for dev only.\033[0m",
                file=sys.stderr,
            )
            sys.exit(1)


_bootstrap_security_env()


app = FastAPI(title="AI 쇼츠 자동 제작", lifespan=lifespan)

STATIC_DIR = os.path.join(settings.BASE_DIR, "static")

# 정적 파일 서빙
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# API 라우트 등록 — 임베드 모드 포트 게이트(X-App-Token). standalone 모드에선 verify_app_token 이 no-op.
# /health(app-level) 와 /static 마운트는 게이트 제외 — Electron 부팅 health 폴링은 토큰 없이 직접 친다.
_protected = [Depends(verify_app_token)]
app.include_router(auth.router, dependencies=_protected)
app.include_router(generate.router, dependencies=_protected)
app.include_router(jobs.router, dependencies=_protected)
app.include_router(preview.router, dependencies=_protected)
app.include_router(assets.router, dependencies=_protected)
app.include_router(bgm_router, dependencies=_protected)
app.include_router(tts_preview.router, dependencies=_protected)
app.include_router(admin.router, dependencies=_protected)
app.include_router(products.router, dependencies=_protected)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root(request: Request):
    # 로컬 단일 사용자 모드: 로그인 없이 항상 메인 화면.
    if settings.LOCAL_SINGLE_USER:
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
    token = request.cookies.get("access_token")
    if token:
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
    return RedirectResponse("/static/login.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    # 보안: 기본은 루프백(127.0.0.1)만. Electron 임베드(단일 사용자, 무인증)에서 LAN 노출 방지.
    # Docker/Railway 처럼 외부 노출이 필요한 배포는 HOST=0.0.0.0 을 env 로 명시한다(Dockerfile 참조).
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("main:app", host=host, port=port)
