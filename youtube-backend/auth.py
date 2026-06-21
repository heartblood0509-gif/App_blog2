"""로컬 API 토큰 인증 — youtube-backend 포트 게이트.

Electron 임베드(LOCAL_SINGLE_USER=1)에서만 작동한다. 블로그 백엔드(backend/auth.py)와
동일한 X-App-Token 패턴이지만, youtube-backend 는 standalone 웹앱(멀티유저/OAuth)으로도
기동될 수 있으므로 임베드 모드가 아니면 게이트를 적용하지 않는다(기존 사용자 인증에 위임).

Electron main 이 부팅 시 32바이트 랜덤 토큰을 생성해 APP_TOKEN env 로 주입하고,
Next 프록시(frontend /api/youtube/[...path])가 백엔드 호출에 X-App-Token 헤더로 동봉한다.
브라우저는 이 헤더를 직접 못 붙이지만, 모든 미디어·SSE·요청이 그 프록시를 거치므로 전부 커버된다.

dev 폴백: APP_TOKEN 미설정 + ALLOW_INSECURE_DEV_AUTH=1 이면 통과(blog 와 동일).
APP_TOKEN 미설정 + 플래그 없음은 main.py 의 fail-closed 가 부팅 단계에서 먼저 차단한다.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, status

from config import settings


def _allow_insecure() -> bool:
    return os.environ.get("ALLOW_INSECURE_DEV_AUTH") == "1"


async def verify_app_token(x_app_token: str | None = Header(default=None)) -> None:
    # standalone(멀티유저/OAuth) 모드에선 포트 토큰 게이트를 적용하지 않는다.
    if not settings.LOCAL_SINGLE_USER:
        return
    expected = os.environ.get("APP_TOKEN")
    if expected is None:
        # main.py 의 fail-closed 가 통과시켰다면 ALLOW_INSECURE_DEV_AUTH=1 인 상태.
        if _allow_insecure():
            return
        # 이론상 도달 불가 (main 부팅이 sys.exit 됐어야 함).
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "APP_TOKEN not configured")
    if x_app_token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid app token")
