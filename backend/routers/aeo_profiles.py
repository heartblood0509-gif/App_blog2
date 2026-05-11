"""
AEO 블로그 글쓰기 모드 — AEO 프로필 CRUD.

- 저장소: backend/aeo_profiles.json (brand_profiles.py와 동일한 파일 기반 패턴)
- ID 자동 생성: aeo1, aeo2, ...
- 데이터 구조: 단순화 8개 칸 (브랜드 프로필 60+ 필드 대비 압도적으로 가벼움).
"""
import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import AEO_PROFILES_FILE

router = APIRouter()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_profiles() -> list[dict]:
    if not AEO_PROFILES_FILE.exists():
        return []
    try:
        return json.loads(AEO_PROFILES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_profiles(profiles: list[dict]):
    AEO_PROFILES_FILE.write_text(
        json.dumps(profiles, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def find_profile(profile_id: str) -> Optional[dict]:
    for p in _load_profiles():
        if p.get("id") == profile_id:
            return p
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마 (단순화 8개 칸)
# ─────────────────────────────────────────────

class AeoProfileUpsert(BaseModel):
    """등록·수정 입력. id는 서버에서 부여."""
    label: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    category: str = ""
    oneLineIntro: str = ""

    # [4] 작성자 신원
    identity: dict[str, Any] = {}

    # [5] 누구에게 도움 주나
    audience: str = ""

    # [6] 추천 기준 (배열 순서 = 우선순위)
    recommendationCriteria: list[str] = []

    # [7] 자주 인용하는 출처
    trustedSources: list[str] = []

    # [8] 절대 쓰지 않는 말
    forbidden: dict[str, Any] = {}


# ─────────────────────────────────────────────
# API
# ─────────────────────────────────────────────

@router.get("/")
async def list_profiles() -> list[dict]:
    """등록된 AEO 프로필 전체 목록 (모든 필드)."""
    return _load_profiles()


@router.get("/{profile_id}")
async def get_profile(profile_id: str) -> dict:
    p = find_profile(profile_id)
    if not p:
        raise HTTPException(404, "해당 AEO 프로필을 찾을 수 없습니다.")
    return p


@router.post("/")
async def create_profile(req: AeoProfileUpsert) -> dict:
    profiles = _load_profiles()

    existing_ids = {p.get("id") for p in profiles}
    idx = 1
    while f"aeo{idx}" in existing_ids:
        idx += 1
    new_id = f"aeo{idx}"

    for p in profiles:
        if p.get("label") == req.label:
            raise HTTPException(400, f"이미 등록된 AEO 프로필 라벨입니다: {req.label}")

    new_profile = {"id": new_id, **req.model_dump()}
    profiles.append(new_profile)
    _save_profiles(profiles)
    return new_profile


@router.put("/{profile_id}")
async def update_profile(profile_id: str, req: AeoProfileUpsert) -> dict:
    profiles = _load_profiles()
    for i, p in enumerate(profiles):
        if p.get("id") == profile_id:
            updated = {"id": profile_id, **req.model_dump()}
            profiles[i] = updated
            _save_profiles(profiles)
            return updated
    raise HTTPException(404, "해당 AEO 프로필을 찾을 수 없습니다.")


@router.delete("/{profile_id}")
async def delete_profile(profile_id: str) -> dict:
    profiles = _load_profiles()
    new_profiles = [p for p in profiles if p.get("id") != profile_id]
    if len(new_profiles) == len(profiles):
        raise HTTPException(404, "해당 AEO 프로필을 찾을 수 없습니다.")
    _save_profiles(new_profiles)
    return {"message": f"AEO 프로필 '{profile_id}'이 삭제되었습니다."}
