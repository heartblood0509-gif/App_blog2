"""
후기성 블로그 — 사용자 등록 제품 CRUD.

- 저장소: backend/products.json
- ID 자동 생성: product1, product2, ...
- 시드 제품(테라피샴푸 등 6개)은 프론트엔드 코드에 하드코딩되어 별도 관리되며,
  이 라우터는 사용자가 직접 등록하는 제품만 다룸.
- 모든 메타데이터 필드를 필수로 받아 시드와 동일한 프롬프트 품질 보장.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import storage
from config import PRODUCTS_FILE

router = APIRouter()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_products() -> list[dict]:
    """읽기 전용 로드(손상 시 자동복구, 복구 불가면 CorruptStoreError → 503)."""
    return storage.read(PRODUCTS_FILE)


def find_product(product_id: str) -> Optional[dict]:
    for p in _load_products():
        if p.get("id") == product_id:
            return p
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────

class ProductUpsert(BaseModel):
    """등록·수정 입력. id는 서버에서 부여.

    v2 (후기성 폼 개편):
    - hasReviews 토글 추가 — false면 realReviews 비어도 OK, expectedReactions로 대체
    - defaultAdvantages → 5분할 필드(efficacy/ingredients/usability/differentiator/usage)로 세분화
      · 호환성 위해 defaultAdvantages 도 그대로 유지 (5칸을 합쳐 보존하거나 기존 데이터 그대로)
    - 5분할 필드는 모두 선택 (사용자가 일부만 적어도 OK)
    """
    name: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    defaultAdvantages: str = ""  # 기존 단일 텍스트(레거시·호환). 5분할 필드를 합쳐 자동 채움
    relatedSymptoms: list[str] = Field(..., min_length=1)
    naturalMentionPatterns: list[str] = Field(..., min_length=1)
    keyInsight: str = Field(..., min_length=1)
    sensoryDetails: list[str] = Field(..., min_length=1)
    # 후기 — hasReviews=False면 비어도 OK
    realReviews: list[str] = []
    productUrl: str = ""  # 선택 — 판매 제품 URL. 있으면 프론트 생성 후처리에서 본문 끝에 삽입
    expectedReactions: list[str] = []  # 신상품(hasReviews=False) 전용 — "예상 사용자 반응"
    hasReviews: bool = True  # 기본값 true (기존 데이터 호환)
    # 장점 5분할 (모두 선택, 채울수록 글 품질 ↑)
    efficacy: str = ""        # 효능·기대 효과
    ingredients: str = ""     # 핵심 성분·특징
    usability: str = ""       # 사용감 (감각)
    differentiator: str = ""  # 차별 포인트
    usage: str = ""           # 사용 방법·팁
    # ─────── 사이클 2: 후기성 글 빌딩 블록 (모두 선택) ───────
    usagePeriod: str = ""              # 사용 기간·체감 시점 — 시간축 단락
    previousProductComparison: str = ""  # 이전 사용 제품 / 바꾼 이유 — 전환 서사 hook
    priceRange: str = ""               # 가격대·가성비 포지셔닝 — 결론부 톤
    targetPersona: str = ""            # 구체적 타겟 페르소나 — 공감 단락
    precautions: str = ""              # 부작용·안 맞을 수 있는 케이스 — 신뢰도 단락


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
    with storage.transaction(PRODUCTS_FILE) as txn:
        products = txn.items

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
        txn.commit(products)
    return new_product


@router.put("/{product_id}")
async def update_product(product_id: str, req: ProductUpsert) -> dict:
    with storage.transaction(PRODUCTS_FILE) as txn:
        products = txn.items
        for i, p in enumerate(products):
            if p.get("id") == product_id:
                for other in products:
                    if other.get("id") != product_id and other.get("name") == req.name:
                        raise HTTPException(400, f"이미 등록된 제품 이름입니다: {req.name}")
                updated = {"id": product_id, **req.model_dump()}
                products[i] = updated
                txn.commit(products)
                return updated
    raise HTTPException(404, "해당 제품을 찾을 수 없습니다.")


@router.delete("/{product_id}")
async def delete_product(product_id: str) -> dict:
    with storage.transaction(PRODUCTS_FILE) as txn:
        products = txn.items
        new_products = [p for p in products if p.get("id") != product_id]
        if len(new_products) == len(products):
            raise HTTPException(404, "해당 제품을 찾을 수 없습니다.")
        txn.commit(new_products)
    return {"message": f"제품 '{product_id}'이 삭제되었습니다."}
