"""로컬 API 토큰 인증 (§A-1).

Electron main 이 부팅 시 32바이트 랜덤 토큰을 생성하고 backend env 에 주입한다.
모든 state-changing 라우터는 이 Dependency 를 통해 X-App-Token 헤더를 검증.

dev 모드 fallback (§J):
  - APP_TOKEN env 가 없고 ALLOW_INSECURE_DEV_AUTH != "1" 이면 모듈 import 자체가 거부됨
    (main.py 에서 fail-closed 가 먼저 동작).
  - APP_TOKEN env 가 없고 ALLOW_INSECURE_DEV_AUTH == "1" 이면 verify 가 항상 통과.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def _allow_insecure() -> bool:
    return os.environ.get("ALLOW_INSECURE_DEV_AUTH") == "1"


async def verify_app_token(x_app_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("APP_TOKEN")
    if expected is None:
        # main.py 의 fail-closed 가 통과시켰다면 ALLOW_INSECURE_DEV_AUTH=1 인 상태.
        if _allow_insecure():
            return
        # 이론상 도달 불가 (main 부팅이 sys.exit 됐어야 함).
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "APP_TOKEN not configured")
    if x_app_token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid app token")
