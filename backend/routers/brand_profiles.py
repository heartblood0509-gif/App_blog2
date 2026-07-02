"""
브랜드 블로그 글쓰기 모드 — 브랜드 프로필 CRUD.

- 저장소: backend/brand_profiles.json (accounts.py와 동일한 파일 기반 패턴)
- ID 자동 생성: brand1, brand2, ...
- 데이터 구조: 풍부한 자유형(dict). 필수 필드만 검증, 나머지는 그대로 저장하여
  사용자가 동일 양식으로 새 프로필 등록 시 모든 항목이 유지되도록 함.
"""
import uuid as uuidlib
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import storage
from config import BRAND_PROFILES_FILE

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_profiles() -> list[dict]:
    """읽기 전용 로드(손상 시 자동복구, 복구 불가면 CorruptStoreError → 503)."""
    return storage.read(BRAND_PROFILES_FILE)


def find_profile(profile_id: str) -> Optional[dict]:
    for p in _load_profiles():
        if p.get("id") == profile_id:
            return p
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────

class BrandProfileUpsert(BaseModel):
    """
    등록·수정 입력. id는 서버에서 부여하므로 입력에서 제외.

    v2 스키마 (양식 축소 후):
    - 제거된 필드: label, supportingPersona, authorityAssets, metaphors, signaturePhrases
    - narrator.character 제거됨
    - authorityAssets 내용은 narrator.authority(string)에 줄바꿈으로 흡수됨
    - extra='ignore': 구 JSON 데이터에 남은 폐기 키들은 로드 시 무시
    """
    model_config = ConfigDict(extra="ignore")

    # 기기 공통 안정 식별자 + 최종수정시각(동기화용). 로컬 id(brandN)와 별개.
    # extra="ignore"라 명시하지 않으면 저장 시 버려지므로 반드시 선언.
    uuid: Optional[str] = None
    updatedAt: Optional[str] = None

    name: str = Field(..., min_length=1)
    category: str = ""
    oneLine: str = ""
    coreValues: list[str] = []

    narrator: dict[str, Any] = {}

    story: dict[str, Any] = {}
    episodes: list[dict[str, Any]] = []

    services: list[str] = []

    targets: dict[str, Any] = {}
    differentiators: list[str] = []

    villains: list[str] = []

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
    with storage.transaction(BRAND_PROFILES_FILE) as txn:
        profiles = txn.items

        existing_ids = {p.get("id") for p in profiles}
        idx = 1
        while f"brand{idx}" in existing_ids:
            idx += 1
        new_id = f"brand{idx}"

        for p in profiles:
            if p.get("name") == req.name:
                raise HTTPException(400, f"이미 등록된 브랜드명입니다: {req.name}")

        data = req.model_dump()
        data["uuid"] = data.get("uuid") or str(uuidlib.uuid4())
        data["updatedAt"] = _now_iso()
        new_profile = {"id": new_id, **data}
        profiles.append(new_profile)
        txn.commit(profiles)
    return new_profile


@router.put("/{profile_id}")
async def update_profile(profile_id: str, req: BrandProfileUpsert) -> dict:
    with storage.transaction(BRAND_PROFILES_FILE) as txn:
        profiles = txn.items
        for i, p in enumerate(profiles):
            if p.get("id") == profile_id:
                data = req.model_dump()
                # uuid 는 기존 값 보존(클라가 안 보내면 유지), updatedAt 는 갱신.
                data["uuid"] = data.get("uuid") or p.get("uuid") or str(uuidlib.uuid4())
                data["updatedAt"] = _now_iso()
                updated = {"id": profile_id, **data}
                profiles[i] = updated
                txn.commit(profiles)
                return updated
    raise HTTPException(404, "해당 브랜드 프로필을 찾을 수 없습니다.")


@router.delete("/{profile_id}")
async def delete_profile(profile_id: str) -> dict:
    with storage.transaction(BRAND_PROFILES_FILE) as txn:
        profiles = txn.items
        new_profiles = [p for p in profiles if p.get("id") != profile_id]
        if len(new_profiles) == len(profiles):
            raise HTTPException(404, "해당 브랜드 프로필을 찾을 수 없습니다.")
        txn.commit(new_profiles)
    return {"message": f"브랜드 프로필 '{profile_id}'이 삭제되었습니다."}
