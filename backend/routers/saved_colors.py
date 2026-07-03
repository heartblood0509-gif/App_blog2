"""
쇼츠 제목 "저장한 색" 팔레트 — 사용자 커스텀 색 CRUD (여러 기기 동기화 대상).

- 저장소: backend data 디렉터리의 saved_colors.json (항목 {id, uuid, hex, updatedAt}).
- 자연키는 hex 자체. 같은 색은 하나만 존재하도록 dedupe 한다.
- uuid 는 hex 에서 **결정론적으로**(uuid5) 부여 → 여러 기기가 같은 색을 독립 저장해도
  동일 uuid 가 나와, 클라우드 동기화(user_profiles, item_uuid 기준 upsert)에서 자동 병합된다.
  (그래서 "A/B 기기가 같은 색 저장 → 중복 안 생김"이 성립.)
- 색값은 프론트·백엔드 양쪽에서 #RRGGBB 로만 통과(제목 렌더가 ffmpeg drawtext 에 쓰므로).
"""
import re
import uuid as uuidlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

import storage
from config import SAVED_COLORS_FILE

router = APIRouter()

_HEX_RE = re.compile(r"^#?([0-9A-Fa-f]{6})$")
# hex → 결정론적 uuid 네임스페이스(기기 공통 안정 식별자 생성용).
_COLOR_NS = uuidlib.uuid5(uuidlib.NAMESPACE_URL, "app-blog2:saved-color")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_hex(value: str) -> str:
    m = _HEX_RE.match((value or "").strip())
    if not m:
        raise HTTPException(400, "색상 코드는 #RRGGBB 형식이어야 합니다.")
    return "#" + m.group(1).upper()


def _uuid_for(hex_norm: str) -> str:
    return str(uuidlib.uuid5(_COLOR_NS, hex_norm))


class SavedColorUpsert(BaseModel):
    # 기기 공통 안정 식별자 + 최종수정시각(동기화용). 미지정이면 서버가 hex 로부터 부여.
    uuid: Optional[str] = None
    updatedAt: Optional[str] = None
    hex: str

    @field_validator("hex")
    @classmethod
    def _valid_hex(cls, v: str) -> str:
        m = _HEX_RE.match((v or "").strip())
        if not m:
            raise ValueError("색상 코드는 #RRGGBB 형식이어야 합니다.")
        return "#" + m.group(1).upper()


@router.get("/")
async def list_saved_colors() -> list[dict]:
    return storage.read(SAVED_COLORS_FILE)


@router.post("/")
async def create_saved_color(req: SavedColorUpsert) -> dict:
    hex_norm = _normalize_hex(req.hex)
    with storage.transaction(SAVED_COLORS_FILE) as txn:
        colors = txn.items
        # 같은 색이 이미 있으면 그대로 반환(멱등) — dedupe.
        for c in colors:
            if str(c.get("hex", "")).upper() == hex_norm:
                return c
        existing_ids = {c.get("id") for c in colors}
        idx = 1
        while f"color{idx}" in existing_ids:
            idx += 1
        new_color = {
            "id": f"color{idx}",
            "uuid": req.uuid or _uuid_for(hex_norm),
            "hex": hex_norm,
            "updatedAt": _now_iso(),
        }
        colors.append(new_color)
        txn.commit(colors)
    return new_color


@router.put("/{color_id}")
async def update_saved_color(color_id: str, req: SavedColorUpsert) -> dict:
    hex_norm = _normalize_hex(req.hex)
    with storage.transaction(SAVED_COLORS_FILE) as txn:
        colors = txn.items
        for i, c in enumerate(colors):
            if c.get("id") == color_id:
                updated = {
                    "id": color_id,
                    "uuid": req.uuid or c.get("uuid") or _uuid_for(hex_norm),
                    "hex": hex_norm,
                    "updatedAt": _now_iso(),
                }
                colors[i] = updated
                txn.commit(colors)
                return updated
    raise HTTPException(404, "해당 저장색을 찾을 수 없습니다.")


@router.delete("/{color_id}")
async def delete_saved_color(color_id: str) -> dict:
    with storage.transaction(SAVED_COLORS_FILE) as txn:
        colors = txn.items
        remaining = [c for c in colors if c.get("id") != color_id]
        if len(remaining) == len(colors):
            raise HTTPException(404, "해당 저장색을 찾을 수 없습니다.")
        txn.commit(remaining)
    return {"message": f"저장색 '{color_id}'이 삭제되었습니다."}
