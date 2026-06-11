"""앱 설정 - 환경 변수 및 경로 관리"""

from pydantic_settings import BaseSettings
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Settings(BaseSettings):
    # API 키
    GEMINI_API_KEY: str = ""
    TYPECAST_API_KEY: str = ""
    FAL_KEY: str = ""

    # 데이터베이스 (빈 값이면 로컬 SQLite, Railway 배포 시 자동 설정)
    DATABASE_URL: str = ""

    # 경로
    BASE_DIR: str = BASE_DIR
    STORAGE_DIR: str = os.path.join(BASE_DIR, "storage")
    BGM_DIR: str = os.path.join(BASE_DIR, "bgm")

    # 폰트 (우선순위별 탐색)
    FONT_TITLE: str = ""
    FONT_SUB: str = ""

    # 영상 기본값
    TARGET_WIDTH: int = 1080
    TARGET_HEIGHT: int = 1920
    FPS: int = 30

    # Gemini 모델
    GEMINI_TEXT_MODEL: str = "gemini-3-flash-preview"
    GEMINI_IMAGE_MODEL: str = "gemini-3.1-flash-image-preview"

    # 이미지 생성 속도 조절 (무료 티어 분당 한도 보호용)
    # 동시 생성 장수와 장 사이 간격(초). 무료 티어는 분당 요청 수가 적어
    # 한꺼번에 보내면 429(요청 횟수 초과)가 나므로 천천히 순차 전송한다.
    IMAGE_GEN_CONCURRENCY: int = 1
    IMAGE_GEN_INTERVAL_SEC: float = 12.0

    # JWT 인증
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 회원가입 초대 코드 (빈 값이면 초대 코드 없이 가입 가능)
    INVITE_CODE: str = ""

    # 로컬 단일 사용자 모드 — Electron 데스크톱 임베드 전용.
    # 1이면 로그인/회원가입/OAuth 없이 고정 로컬 계정 1개로 동작한다.
    # (블로그앱이 youtube-backend 를 두 번째 로컬 백엔드로 띄워 iframe 으로 임베드)
    LOCAL_SINGLE_USER: bool = False
    LOCAL_USER_EMAIL: str = "local@localhost"

    # 서비스 기본 URL (비밀번호 재설정 이메일 링크 등에 사용)
    BASE_URL: str = "http://localhost:8000"

    # OAuth - Google
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # OAuth - Kakao
    KAKAO_CLIENT_ID: str = ""
    KAKAO_CLIENT_SECRET: str = ""
    KAKAO_REDIRECT_URI: str = "http://localhost:8000/api/auth/kakao/callback"

    # SMTP (비밀번호 재설정 이메일)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # Cloudflare R2 (빈 값이면 로컬 전용)
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PRESIGN_EXPIRE_SECONDS: int = 3600

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()


# 유튜브 "AI가 모두 생성"(Card A) 스위치. False=숨김+차단(출시 기본), True=복원.
# ⚠ 프론트 쌍: frontend/src/lib/youtube-ai-full-feature.ts 의 YT_AI_FULL_ENABLED — 항상 같은 값 유지.
#    복원 시 손볼 곳 3개: 이 상수 + 프론트 플래그 + static/index.html 의 ai_full 카드 주석 해제.
YT_AI_FULL_ENABLED = False


def find_font(bold=True):
    """한국어 폰트 탐색. 앱 동봉 폰트(fonts/Pretendard) 를 1순위로, 없으면 시스템 폰트 폴백.

    동봉 폰트를 우선하면 사용자 PC 의 폰트 설치 여부·플랫폼과 무관하게 모든 환경
    (dev·배포본·타 PC)에서 동일한 한글 렌더가 보장된다. 예전엔 시스템 폰트만 찾아
    PC 마다 결과가 달랐고, 한글 폰트가 없는 환경에선 글자가 깨질(tofu) 수 있었다.
    (PACKAGING.md 의 YoutubeGenerator.spec 이 fonts/ 를 datas 로 배포에 동봉한다.)"""
    import glob as _glob
    home = os.path.expanduser("~")

    # 1순위: 앱에 동봉한 Pretendard(.otf). 제목은 굵게(ExtraBold), 자막은 보통(Regular).
    bundled_names = (
        ("Pretendard-ExtraBold.otf", "Pretendard-Bold.otf")
        if bold
        else ("Pretendard-Regular.otf", "Pretendard-SemiBold.otf")
    )
    for _name in bundled_names:
        _p = os.path.join(BASE_DIR, "fonts", _name)
        if os.path.exists(_p):
            return _p

    if sys.platform == "win32":
        if bold:
            candidates = [
                "C:/Windows/Fonts/Pretendard-ExtraBold.otf",
                "C:/Windows/Fonts/Pretendard-Bold.otf",
                "C:/Windows/Fonts/malgunbd.ttf",
                "C:/Windows/Fonts/NanumGothicBold.ttf",
            ]
        else:
            candidates = [
                "C:/Windows/Fonts/Pretendard-SemiBold.otf",
                "C:/Windows/Fonts/Pretendard-Regular.otf",
                "C:/Windows/Fonts/malgun.ttf",
                "C:/Windows/Fonts/NanumGothic.ttf",
            ]
    elif sys.platform == "darwin":
        if bold:
            candidates = [
                f"{home}/Library/Fonts/GmarketSansTTFBold.ttf",
                f"{home}/Library/Fonts/NanumSquareEB.ttf",
                f"{home}/Library/Fonts/Pretendard-Bold.ttf",
                "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            ]
        else:
            candidates = [
                f"{home}/Library/Fonts/NanumSquareR.ttf",
                f"{home}/Library/Fonts/Pretendard-Regular.ttf",
                "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            ]
    else:
        # Linux (Docker) — Pretendard 우선, Noto CJK 폴백
        if bold:
            candidates = [
                "/usr/share/fonts/pretendard/Pretendard-ExtraBold.otf",
                "/usr/share/fonts/pretendard/Pretendard-Bold.otf",
            ]
        else:
            candidates = [
                "/usr/share/fonts/pretendard/Pretendard-SemiBold.otf",
                "/usr/share/fonts/pretendard/Pretendard-Regular.otf",
            ]
        for path in candidates:
            if os.path.exists(path):
                return path
        # 폴백: Noto Sans CJK
        pattern = "**/NotoSansCJK*Bold*" if bold else "**/NotoSansCJK*Regular*"
        found = _glob.glob(f"/usr/share/fonts/{pattern}", recursive=True)
        if found:
            return found[0]
        fallback = "NotoSansCJK-Bold.ttc" if bold else "NotoSansCJK-Regular.ttc"
        candidates = [
            f"/usr/share/fonts/opentype/noto/{fallback}",
            f"/usr/share/fonts/truetype/noto/{fallback}",
        ]

    for path in candidates:
        if os.path.exists(path):
            return path
    return candidates[-1]  # 최종 폴백


# 폰트 자동 설정
if not settings.FONT_TITLE:
    settings.FONT_TITLE = find_font(bold=True)
if not settings.FONT_SUB:
    settings.FONT_SUB = find_font(bold=False)
