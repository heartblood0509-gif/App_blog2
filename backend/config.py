import os

from dotenv import load_dotenv

from paths import (
    ACCOUNTS_FILE,
    AEO_PROFILES_FILE,
    ANALYSIS_RECORDS_FILE,
    BRAND_PROFILES_FILE,
    CHROME_PROFILES_DIR,
    PRODUCTS_FILE,
    SAVED_COLORS_FILE,
)

load_dotenv()

# 네이버 블로그 설정
NAVER_BLOG_URL = "https://blog.naver.com"

# 서버 설정 — Electron 모드에선 main.ts가 PORT/HOST를 env로 주입.
# 기본은 127.0.0.1 (LAN 노출 차단). 경로 변수들은 paths.py 단일 출처에서 import.
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

# §B — Electron 이 frontend 의 정확한 origin 을 env 로 알려줌.
# packaged 에선 항상 set, dev 에선 미설정이라 regex fallback (main.py 분기).
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")

# paths.py에서 가져온 경로들을 그대로 re-export (기존 import 경로 호환)
__all__ = [
    "NAVER_BLOG_URL",
    "HOST",
    "PORT",
    "ACCOUNTS_FILE",
    "AEO_PROFILES_FILE",
    "ANALYSIS_RECORDS_FILE",
    "BRAND_PROFILES_FILE",
    "PRODUCTS_FILE",
    "SAVED_COLORS_FILE",
    "CHROME_PROFILES_DIR",
    "FRONTEND_ORIGIN",
]
