import logging
import os
import sys
from logging.handlers import RotatingFileHandler

# 2차 안전망 — Electron 이 PYTHONIOENCODING=utf-8:replace 를 주입하지만,
# dev 실행 경로(`python main.py`) 등 env 가 누락되는 경우까지 커버.
# CPython 3.7+ TextIOWrapper.reconfigure 사용.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.publish import router as publish_router
from routers.accounts import router as accounts_router
from routers.brand_profiles import router as brand_profiles_router
from routers.analysis_records import router as analysis_records_router, ensure_builtin_seeds
from routers.products import router as products_router
from config import HOST, PORT
from auth import verify_app_token
from log_redactor import RedactingFilter
from paths import LOG_DIR


def _configure_logging() -> None:
    """§G — userData/logs/backend.log 로 회전 저장 + redaction filter."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")

    # 회전 파일 핸들러
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        fh = RotatingFileHandler(
            LOG_DIR / "backend.log",
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        fh.setFormatter(fmt)
        fh.addFilter(RedactingFilter())
        root.addHandler(fh)
    except Exception as e:
        print(f"[WARN] log file setup failed: {e}", file=sys.stderr)

    # stdout 핸들러에도 redact filter (Electron 이 stdout 캡처해 main.log 로 보냄)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    sh.addFilter(RedactingFilter())
    root.addHandler(sh)


_configure_logging()

# 부팅 시 stdio 인코딩 진단. 이 줄이 backend.log·main.log 양쪽에 정상 기록되면
# stdout 인코딩 fix 가 동작 + RotatingFileHandler/StreamHandler 둘 다 살아있음을 동시 검증.
logging.getLogger(__name__).info(
    "stdio encoding stdout=%s stderr=%s utf-test=✓ 🚀",
    getattr(sys.stdout, "encoding", None),
    getattr(sys.stderr, "encoding", None),
)


# ─────────────────────────────────────────────────────────────
# §J fail-closed 정책
#
# packaged 빌드(Electron main 이 spawn)에선 APP_TOKEN 과 APP_CREDENTIAL_BROKER_URL
# 두 env 가 반드시 주입됨. dev PC 에서 직접 `python main.py` 를 실행할 때만
# ALLOW_INSECURE_DEV_AUTH=1 / ALLOW_INSECURE_DEV_PW=1 명시 플래그로 우회 가능.
#
# 보안 플래그가 silently 꺼지는 사고를 막기 위해, 부팅 시점에 fail-closed.
# ─────────────────────────────────────────────────────────────


def _bootstrap_security_env() -> None:
    fatal: list[str] = []
    warnings: list[str] = []

    if not os.environ.get("APP_TOKEN"):
        if os.environ.get("ALLOW_INSECURE_DEV_AUTH") == "1":
            warnings.append("APP_TOKEN unset")
        else:
            fatal.append(
                "APP_TOKEN env is required. "
                "Set ALLOW_INSECURE_DEV_AUTH=1 for dev only."
            )

    if not os.environ.get("APP_CREDENTIAL_BROKER_URL"):
        if os.environ.get("ALLOW_INSECURE_DEV_PW") == "1":
            warnings.append("APP_CREDENTIAL_BROKER_URL unset")
        else:
            fatal.append(
                "APP_CREDENTIAL_BROKER_URL env is required. "
                "Set ALLOW_INSECURE_DEV_PW=1 for dev only."
            )

    if fatal:
        # ANSI red — Electron main 의 stdout 캡처에서도 눈에 띄게.
        for msg in fatal:
            print(f"\033[31m[FATAL] {msg}\033[0m", file=sys.stderr)
        sys.exit(1)

    for w in warnings:
        print(f"\033[33m[WARN] INSECURE DEV MODE: {w}\033[0m", file=sys.stderr)


_bootstrap_security_env()


# CORS — §B
# packaged 에선 Electron 이 FRONTEND_ORIGIN 을 명시 주입. dev fallback 은 regex.
_frontend_origin = os.environ.get("FRONTEND_ORIGIN")


app = FastAPI(title="후기성 블로그 - 자동 포스팅 서버")

if _frontend_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[_frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # dev fallback — Electron 미경유 직접 실행 시. 127.0.0.1/localhost 의 모든 포트 허용.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(127\.0\.0\.1|localhost):\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# §A-1 — state-changing 라우터들은 모두 APP_TOKEN 검증을 통과해야 한다.
_protected = [Depends(verify_app_token)]

app.include_router(publish_router, prefix="/publish", tags=["publish"], dependencies=_protected)
app.include_router(accounts_router, prefix="/accounts", tags=["accounts"], dependencies=_protected)
app.include_router(brand_profiles_router, prefix="/brand-profiles", tags=["brand-profiles"], dependencies=_protected)
app.include_router(analysis_records_router, prefix="/analysis-records", tags=["analysis-records"], dependencies=_protected)
app.include_router(products_router, prefix="/products", tags=["products"], dependencies=_protected)


@app.on_event("startup")
async def _on_startup() -> None:
    """§C — legacy 평문 naver_pw 가 있으면 잠근 형태로 마이그레이션."""
    from config import ACCOUNTS_FILE
    from credentials import migrate_legacy_plaintext_pw

    try:
        migrate_legacy_plaintext_pw(ACCOUNTS_FILE)
    except Exception:
        # 마이그레이션 실패가 부팅을 막지는 않음. atomic write 라 원본은 안 깨짐.
        import logging
        logging.getLogger(__name__).exception("startup migration failed")


# 첫 기동 시 builtin 분석 레코드 시드 (이미 있으면 덮어쓰지 않음).
# 모듈 import 시점에 즉시 실행 — origin/main 의 호출 위치와 동일하게 유지.
ensure_builtin_seeds()


@app.get("/health")
async def health():
    """토큰 면제 — Electron 의 boot health 폴링이 토큰 주입 타이밍보다 먼저일 수 있음."""
    return {"status": "ok"}


def run() -> None:
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    run()
