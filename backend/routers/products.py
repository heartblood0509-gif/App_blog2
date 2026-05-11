"""
후기성 블로그 — 사용자 등록 제품 CRUD.

- 저장소: backend/products.json
- ID 자동 생성: product1, product2, ...
- 시드 제품(테라피샴푸 등 6개)은 프론트엔드 코드에 하드코딩되어 별도 관리되며,
  이 라우터는 사용자가 직접 등록하는 제품만 다룸.
- 모든 메타데이터 필드를 필수로 받아 시드와 동일한 프롬프트 품질 보장.
"""
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import PRODUCTS_FILE

router = APIRouter()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_products() -> list[dict]:
    if not PRODUCTS_FILE.exists():
        return []
    try:
        return json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_products(products: list[dict]):
    PRODUCTS_FILE.write_text(
        json.dumps(products, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def find_product(product_id: str) -> Optional[dict]:
    for p in _load_products():
        if p.get("id") == product_id:
            return p
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────

class ProductUpsert(BaseModel):
    """등록·수정 입력. id는 서버에서 부여."""
    name: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    defaultAdvantages: str = Field(..., min_length=1)
    relatedSymptoms: list[str] = Field(..., min_length=1)
    naturalMentionPatterns: list[str] = Field(..., min_length=1)
    keyInsight: str = Field(..., min_length=1)
    sensoryDetails: list[str] = Field(..., min_length=1)
    realReviews: list[str] = Field(..., min_length=1)


# ─────────────────────────────────────────────
# API
# ─────────────────────────────────────────────

@router.get("/")
async def list_products() -> list[dict]:
    return _load_products()


@router.get("/{product_id}")
async def get_product(product_id: str) -> dict:
    p = find_product(product_id)
    if not p:
        raise HTTPException(404, "해당 제품을 찾을 수 없습니다.")
    return p


@router.post("/")
async def create_product(req: ProductUpsert) -> dict:
    products = _load_products()

    for p in products:
        if p.get("name") == req.name:
            raise HTTPException(400, f"이미 등록된 제품 이름입니다: {req.name}")

    existing_ids = {p.get("id") for p in products}
    idx = 1
    while f"product{idx}" in existing_ids:
        idx += 1
    new_id = f"product{idx}"

    new_product = {"id": new_id, **req.model_dump()}
    products.append(new_product)
    _save_products(products)
    return new_product


@router.put("/{product_id}")
async def update_product(product_id: str, req: ProductUpsert) -> dict:
    products = _load_products()
    for i, p in enumerate(products):
        if p.get("id") == product_id:
            for other in products:
                if other.get("id") != product_id and other.get("name") == req.name:
                    raise HTTPException(400, f"이미 등록된 제품 이름입니다: {req.name}")
            updated = {"id": product_id, **req.model_dump()}
            products[i] = updated
            _save_products(products)
            return updated
    raise HTTPException(404, "해당 제품을 찾을 수 없습니다.")


@router.delete("/{product_id}")
async def delete_product(product_id: str) -> dict:
    products = _load_products()
    new_products = [p for p in products if p.get("id") != product_id]
    if len(new_products) == len(products):
        raise HTTPException(404, "해당 제품을 찾을 수 없습니다.")
    _save_products(new_products)
    return {"message": f"제품 '{product_id}'이 삭제되었습니다."}
