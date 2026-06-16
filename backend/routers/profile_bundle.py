"""
프로필 번들 가져오기 — 브랜드/AEO/제품 프로필 3종을 묶음 JSON으로 받아 등록.

내보내기는 프론트엔드 클라이언트 사이드에서 처리(이미 GET API로 받은 데이터를
패키징하면 끝). 가져오기만 트랜잭션 성격이라 서버에서 처리.

**Vercel KV 환경 미지원**: 데스크톱(Electron) 전용. KV가 활성화된 환경에서는
프론트 프록시가 KV 경로로 데이터를 다루므로 이 백엔드 엔드포인트가 호출되어도
로컬 파일만 갱신될 뿐 KV에 반영되지 않는다.

흐름:
  1) 번들 구조/버전 검증
  2) 번들 내부 자체 중복 검사 (같은 unique key가 2개 이상 → 통째로 거부)
  3) `.backup/profiles_{ts}/` 폴더에 현재 3개 JSON 자동 백업
  4) 각 종류별로 selection에 포함된 항목만 처리
     - 기존에 있으면 conflictPolicy("overwrite" | "skip") 적용
     - 신규면 새 ID 발급해서 추가
     - Pydantic 검증 실패한 항목은 errors에 사유 수집 (다른 항목엔 영향 없음)
"""
from __future__ import annotations

import shutil
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

import storage
from paths import DATA_DIR, BRAND_PROFILES_FILE, AEO_PROFILES_FILE, PRODUCTS_FILE
from routers.brand_profiles import BrandProfileUpsert
from routers.aeo_profiles import AeoProfileUpsert
from routers.products import ProductUpsert

router = APIRouter()

SUPPORTED_VERSION = 1


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────


class BundleSelection(BaseModel):
    brand: list[str] = []
    aeo: list[str] = []
    product: list[str] = []


class ImportRequest(BaseModel):
    bundle: dict[str, Any]
    selection: BundleSelection
    conflictPolicy: Literal["overwrite", "skip"] = "skip"


class ImportResult(BaseModel):
    added: int = 0
    overwritten: int = 0
    skipped: int = 0
    errors: list[str] = []


class ImportResponse(BaseModel):
    brand: ImportResult
    aeo: ImportResult
    product: ImportResult
    backupPath: str


# ─────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────


def _find_duplicates(items: list[dict], key: str) -> list[str]:
    """배열 내에서 동일 unique key 값이 2번 이상 등장하는지 찾는다."""
    seen: set[str] = set()
    dupes: set[str] = set()
    for item in items:
        v = item.get(key)
        if not isinstance(v, str):
            continue
        if v in seen:
            dupes.add(v)
        else:
            seen.add(v)
    return sorted(dupes)


def _next_id(existing_ids: set[str], prefix: str) -> str:
    idx = 1
    while f"{prefix}{idx}" in existing_ids:
        idx += 1
    return f"{prefix}{idx}"


def _backup_data_files() -> str:
    """현재 3개 JSON 파일을 `.backup/profiles_{ts}/`에 복사. 폴더 경로 반환."""
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_dir = DATA_DIR / ".backup" / f"profiles_{ts}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for src in (BRAND_PROFILES_FILE, AEO_PROFILES_FILE, PRODUCTS_FILE):
        if src.exists():
            shutil.copy2(src, backup_dir / src.name)
    return str(backup_dir)


def _format_validation_error(err: ValidationError, label: str) -> str:
    """Pydantic 에러를 한글 단문으로."""
    msgs = []
    for e in err.errors():
        loc = ".".join(str(x) for x in e.get("loc", ()))
        msg = e.get("msg", "검증 실패")
        msgs.append(f"{loc}: {msg}" if loc else msg)
    joined = "; ".join(msgs)
    return f"'{label}' 검증 실패 — {joined}"


# ─────────────────────────────────────────────
# 종류별 처리
# ─────────────────────────────────────────────


def _import_one_type(
    *,
    incoming_items: list[Any],
    selection: list[str],
    unique_key: str,
    upsert_model: type[BaseModel],
    store_file: Path,
    id_prefix: str,
    policy: str,
    display_key: str | None = None,
) -> ImportResult:
    """한 종류(브랜드/AEO/제품)에 대해 import 루프.

    저장소 락(transaction)으로 load→수정→save 전체를 직렬화 — CRUD 와 같은 잠금.
    """
    result = ImportResult()

    # selection 비어있으면 처리 없음
    if not selection:
        return result

    with storage.transaction(store_file) as txn:
        current = txn.items
        existing_by_key: dict[str, dict] = {}
        for p in current:
            v = p.get(unique_key)
            if isinstance(v, str):
                existing_by_key[v] = p

        selection_set = set(selection)
        dirty = False

        for raw in incoming_items:
            if not isinstance(raw, dict):
                result.errors.append("객체가 아닌 항목이 포함되어 있습니다.")
                continue
            key_value = raw.get(unique_key)
            if not isinstance(key_value, str) or not key_value:
                result.errors.append(f"'{unique_key}' 값이 없는 항목이 있습니다.")
                continue
            if key_value not in selection_set:
                continue

            label = raw.get(display_key) if display_key else key_value
            if not isinstance(label, str) or not label:
                label = key_value

            # Pydantic 검증 (id 등 서버 부여 필드는 제외하고 검증)
            payload = {k: v for k, v in raw.items() if k != "id"}
            try:
                validated = upsert_model(**payload)
            except ValidationError as ve:
                result.errors.append(_format_validation_error(ve, label))
                continue

            existing = existing_by_key.get(key_value)
            if existing is not None:
                # 중복 — 정책 적용
                if policy == "skip":
                    result.skipped += 1
                    continue
                # overwrite — 기존 ID 유지
                updated = {"id": existing["id"], **validated.model_dump()}
                existing_by_key[key_value] = updated
                for i, p in enumerate(current):
                    if p.get("id") == existing["id"]:
                        current[i] = updated
                        break
                result.overwritten += 1
                dirty = True
            else:
                # 신규 — 새 ID 발급
                existing_ids = {p.get("id") for p in current if isinstance(p.get("id"), str)}
                new_id = _next_id(existing_ids, id_prefix)
                new_profile = {"id": new_id, **validated.model_dump()}
                current.append(new_profile)
                existing_by_key[key_value] = new_profile
                result.added += 1
                dirty = True

        if dirty:
            txn.commit(current)

    return result


# ─────────────────────────────────────────────
# 엔드포인트
# ─────────────────────────────────────────────


@router.post("/import")
async def import_bundle(req: ImportRequest) -> ImportResponse:
    bundle = req.bundle

    # 1) 버전 검증
    version = bundle.get("version")
    if version != SUPPORTED_VERSION:
        raise HTTPException(
            400,
            f"지원하지 않는 파일 버전입니다. (지원: v{SUPPORTED_VERSION}, 파일: v{version})",
        )

    profiles_obj = bundle.get("profiles")
    if not isinstance(profiles_obj, dict):
        raise HTTPException(400, "파일 구조가 올바르지 않습니다. (profiles 누락)")

    brand_items = profiles_obj.get("brand", []) or []
    aeo_items = profiles_obj.get("aeo", []) or []
    product_items = profiles_obj.get("product", []) or []

    for label, items in (("brand", brand_items), ("aeo", aeo_items), ("product", product_items)):
        if not isinstance(items, list):
            raise HTTPException(400, f"파일 구조가 올바르지 않습니다. (profiles.{label}이 배열이 아님)")

    # 2) 번들 내부 자체 중복 검사 — 있으면 통째로 거부
    self_dupes: list[str] = []
    b_dupes = _find_duplicates(brand_items, "name")
    if b_dupes:
        self_dupes.append(f"브랜드 name 중복: {', '.join(b_dupes)}")
    a_dupes = _find_duplicates(aeo_items, "label")
    if a_dupes:
        self_dupes.append(f"AEO label 중복: {', '.join(a_dupes)}")
    p_dupes = _find_duplicates(product_items, "name")
    if p_dupes:
        self_dupes.append(f"제품 name 중복: {', '.join(p_dupes)}")
    if self_dupes:
        raise HTTPException(400, "파일 내부에 중복된 항목이 있습니다. — " + " / ".join(self_dupes))

    # 3) 자동 백업
    backup_path = _backup_data_files()

    # 4) 종류별 import
    brand_result = _import_one_type(
        incoming_items=brand_items,
        selection=req.selection.brand,
        unique_key="name",
        upsert_model=BrandProfileUpsert,
        store_file=BRAND_PROFILES_FILE,
        id_prefix="brand",
        policy=req.conflictPolicy,
    )
    aeo_result = _import_one_type(
        incoming_items=aeo_items,
        selection=req.selection.aeo,
        unique_key="label",
        upsert_model=AeoProfileUpsert,
        store_file=AEO_PROFILES_FILE,
        id_prefix="aeo",
        policy=req.conflictPolicy,
        display_key="name",
    )
    product_result = _import_one_type(
        incoming_items=product_items,
        selection=req.selection.product,
        unique_key="name",
        upsert_model=ProductUpsert,
        store_file=PRODUCTS_FILE,
        id_prefix="product",
        policy=req.conflictPolicy,
    )

    return ImportResponse(
        brand=brand_result,
        aeo=aeo_result,
        product=product_result,
        backupPath=backup_path,
    )
