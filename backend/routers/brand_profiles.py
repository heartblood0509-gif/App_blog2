"""
브랜드 블로그 글쓰기 모드 — 브랜드 프로필 CRUD.

- 저장소: backend/brand_profiles.json (accounts.py와 동일한 파일 기반 패턴)
- ID 자동 생성: brand1, brand2, ...
- 데이터 구조: 풍부한 자유형(dict). 필수 필드만 검증, 나머지는 그대로 저장하여
  사용자가 동일 양식으로 새 프로필 등록 시 모든 항목이 유지되도록 함.
"""
import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import BRAND_PROFILES_FILE

router = APIRouter()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_profiles() -> list[dict]:
    if not BRAND_PROFILES_FILE.exists():
        return []
    try:
        return json.loads(BRAND_PROFILES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_profiles(profiles: list[dict]):
    BRAND_PROFILES_FILE.write_text(
        json.dumps(profiles, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def find_profile(profile_id: str) -> Optional[dict]:
    for p in _load_profiles():
        if p.get("id") == profile_id:
            return p
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────

class BrandProfileUpsert(BaseModel):
    """등록·수정 입력. id는 서버에서 부여하므로 입력에서 제외."""
    label: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    category: str = ""
    oneLine: str = ""
    coreValues: list[str] = []

    narrator: dict[str, Any] = {}
    supportingPersona: dict[str, Any] = {}

    story: dict[str, Any] = {}
    episodes: list[dict[str, Any]] = []

    authorityAssets: list[str] = []
    services: list[str] = []

    targets: dict[str, Any] = {}
    differentiators: list[str] = []

    villains: list[str] = []
    metaphors: list[str] = []
    signaturePhrases: list[str] = []

    recommendedRoutes: list[str] = []
    cta: dict[str, Any] = {}
    forbidden: dict[str, Any] = {}


# ─────────────────────────────────────────────
# API
# ─────────────────────────────────────────────

@router.get("/")
async def list_profiles() -> list[dict]:
    """등록된 브랜드 프로필 전체 목록 (모든 필드)."""
    return _load_profiles()


@router.get("/{profile_id}")
async def get_profile(profile_id: str) -> dict:
    p = find_profile(profile_id)
    if not p:
        raise HTTPException(404, "해당 브랜드 프로필을 찾을 수 없습니다.")
    return p


@router.post("/")
async def create_profile(req: BrandProfileUpsert) -> dict:
    profiles = _load_profiles()

    existing_ids = {p.get("id") for p in profiles}
    idx = 1
    while f"brand{idx}" in existing_ids:
        idx += 1
    new_id = f"brand{idx}"

    for p in profiles:
        if p.get("label") == req.label:
            raise HTTPException(400, f"이미 등록된 브랜드 라벨입니다: {req.label}")

    new_profile = {"id": new_id, **req.model_dump()}
    profiles.append(new_profile)
    _save_profiles(profiles)
    return new_profile


@router.put("/{profile_id}")
async def update_profile(profile_id: str, req: BrandProfileUpsert) -> dict:
    profiles = _load_profiles()
    for i, p in enumerate(profiles):
        if p.get("id") == profile_id:
            updated = {"id": profile_id, **req.model_dump()}
            profiles[i] = updated
            _save_profiles(profiles)
            return updated
    raise HTTPException(404, "해당 브랜드 프로필을 찾을 수 없습니다.")


@router.delete("/{profile_id}")
async def delete_profile(profile_id: str) -> dict:
    profiles = _load_profiles()
    new_profiles = [p for p in profiles if p.get("id") != profile_id]
    if len(new_profiles) == len(profiles):
        raise HTTPException(404, "해당 브랜드 프로필을 찾을 수 없습니다.")
    _save_profiles(new_profiles)
    return {"message": f"브랜드 프로필 '{profile_id}'이 삭제되었습니다."}
