"""
서사 구조 분석 보관함 — 사용자 분석 + 내장 템플릿 통합 CRUD.

저장소: backend/analysis_records.json

핵심 원칙:
- 원본 견본 글 본문은 저장하지 않는다 (LLM 표절 차단의 핵심 정책).
- 분석 마크다운 + 단계 라벨(flow) + 어미 패턴 통계 요약(excerptPattern)만 보관.

레코드 종류:
- sourceType="user": 사용자가 직접 레퍼런스 모드에서 분석 후 저장
- sourceType="builtin": 시스템 내장 템플릿 (예: 함정 폭로형) — isBuiltin=True, 사용자 수정·삭제 불가

ID 자동 생성:
- 사용자: "analysis-1", "analysis-2", ...
- 내장: "builtin-<slug>" (시드 함수에서 명시)
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import ANALYSIS_RECORDS_FILE

router = APIRouter()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_records() -> list[dict]:
    if not ANALYSIS_RECORDS_FILE.exists():
        return []
    try:
        return json.loads(ANALYSIS_RECORDS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_records(records: list[dict]):
    ANALYSIS_RECORDS_FILE.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find(record_id: str) -> Optional[dict]:
    for r in _load_records():
        if r.get("id") == record_id:
            return r
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────

class AnalysisRecordUpsert(BaseModel):
    label: str = Field(..., min_length=1)
    sourceType: str = Field(..., pattern="^(user|builtin)$")
    sourceUrl: Optional[str] = None
    analysis: str = Field(..., min_length=1)
    flow: list[str] = []
    excerptPattern: str = ""
    # 분석이 속한 템플릿 범위 — 보관함 필터링 키 (intro/info/value-proof/detail). 미지정 시 "info" fallback (하위호환)
    templateScope: Optional[str] = Field(default=None, pattern="^(intro|info|value-proof|detail)$")


# ─────────────────────────────────────────────
# API
# ─────────────────────────────────────────────

@router.get("/")
async def list_records(scope: Optional[str] = None) -> list[dict]:
    """전체 분석 레코드 — builtin 먼저, 그 다음 사용자 분석 (createdAt 내림차순).

    scope: "intro" | "info" | "value-proof" | "detail" 지정 시 해당 템플릿만 필터링.
           미지정 시 전체 반환 (하위호환).
           record에 templateScope 누락 시 "info"로 간주 (마이그레이션 fallback).
    """
    records = _load_records()
    if scope:
        if scope not in ("intro", "info", "value-proof", "detail"):
            raise HTTPException(400, f"잘못된 scope: {scope}")
        records = [r for r in records if (r.get("templateScope") or "info") == scope]
    builtins = [r for r in records if r.get("isBuiltin")]
    users = sorted(
        [r for r in records if not r.get("isBuiltin")],
        key=lambda r: r.get("createdAt", ""),
        reverse=True,
    )
    return [*builtins, *users]


@router.get("/{record_id}")
async def get_record(record_id: str) -> dict:
    r = _find(record_id)
    if not r:
        raise HTTPException(404, "해당 분석 레코드를 찾을 수 없습니다.")
    return r


@router.post("/")
async def create_record(req: AnalysisRecordUpsert) -> dict:
    if req.sourceType == "builtin":
        raise HTTPException(400, "builtin 레코드는 사용자가 생성할 수 없습니다.")

    records = _load_records()

    existing_ids = {r.get("id") for r in records}
    idx = 1
    while f"analysis-{idx}" in existing_ids:
        idx += 1
    new_id = f"analysis-{idx}"

    new_record = {
        "id": new_id,
        "isBuiltin": False,
        "createdAt": _now_iso(),
        **req.model_dump(),
    }
    records.append(new_record)
    _save_records(records)
    return new_record


@router.put("/{record_id}")
async def update_record(record_id: str, req: AnalysisRecordUpsert) -> dict:
    records = _load_records()
    for i, r in enumerate(records):
        if r.get("id") == record_id:
            if r.get("isBuiltin"):
                raise HTTPException(400, "내장 분석 레코드는 수정할 수 없습니다.")
            updated = {
                "id": record_id,
                "isBuiltin": False,
                "createdAt": r.get("createdAt", _now_iso()),
                **req.model_dump(),
            }
            records[i] = updated
            _save_records(records)
            return updated
    raise HTTPException(404, "해당 분석 레코드를 찾을 수 없습니다.")


@router.delete("/{record_id}")
async def delete_record(record_id: str) -> dict:
    records = _load_records()
    target = next((r for r in records if r.get("id") == record_id), None)
    if not target:
        raise HTTPException(404, "해당 분석 레코드를 찾을 수 없습니다.")
    if target.get("isBuiltin"):
        raise HTTPException(400, "내장 분석 레코드는 삭제할 수 없습니다.")
    new_records = [r for r in records if r.get("id") != record_id]
    _save_records(new_records)
    return {"message": f"분석 레코드 '{record_id}'이 삭제되었습니다."}


# ─────────────────────────────────────────────
# Builtin 시드 — 첫 기동 시 1회 주입
# ─────────────────────────────────────────────
#
# 시드 데이터는 backend/analysis_records.json (코드 동봉본)을 단일 진실로 사용.
# 새 시드를 추가하려면 JSON 파일에 isBuiltin=True 객체를 한 건 추가하면 됨 —
# 코드와 데이터 이중 관리 방지.

from pathlib import Path as _Path


def _load_builtin_seeds_from_json() -> list[dict]:
    """backend/analysis_records.json의 isBuiltin=True 레코드를 시드로 사용."""
    seed_file = _Path(__file__).parent.parent / "analysis_records.json"
    if not seed_file.exists():
        return []
    try:
        data = json.loads(seed_file.read_text(encoding="utf-8"))
        return [r for r in data if r.get("isBuiltin")]
    except Exception:
        return []


BUILTIN_SEEDS: list[dict] = _load_builtin_seeds_from_json()


def ensure_builtin_seeds():
    """첫 기동 시 builtin 시드를 주입. 같은 ID가 이미 있으면 덮어쓰지 않음 (idempotent).

    추가로: templateScope 필드가 없는 기존 레코드에 "info"를 자동 보강 (하위호환 마이그레이션).
    """
    records = _load_records()
    existing_ids = {r.get("id") for r in records}
    changed = False
    for seed in BUILTIN_SEEDS:
        if seed["id"] not in existing_ids:
            records.append(seed)
            changed = True
    # templateScope 누락 보강 — 기존 데이터는 모두 정보성글로 간주
    for r in records:
        if "templateScope" not in r or r.get("templateScope") is None:
            r["templateScope"] = "info"
            changed = True
    if changed:
        _save_records(records)
