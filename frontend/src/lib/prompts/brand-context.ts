import type { ProductInfo, UserProduct } from "@/types";

/**
 * v3 (시드 6개 영구 제거):
 * 시드 매핑 6개를 통째로 제거. 후기성 글 생성은 buildProductContext에서
 * `BRAND_PRODUCTS[id] ?? customProductInfoById[id]` 패턴으로 자동 fallback —
 * 사용자 등록 제품의 buildCustomProductInfo 변환 결과만 사용됨.
 *
 * getProductById / getProductNames 함수는 호출처 호환 위해 유지
 * (빈 객체 lookup은 undefined → 호출처가 fallback 처리).
 */
export const BRAND_PRODUCTS: Record<string, ProductInfo> = {};

export function getProductById(id: string): ProductInfo | undefined {
  return BRAND_PRODUCTS[id];
}

export function getProductNames(ids: string[]): string[] {
  return ids
    .map((id) => BRAND_PRODUCTS[id]?.name)
    .filter(Boolean) as string[];
}

/**
 * 사용자 등록 제품을 시드 ProductInfo 모양으로 변환 — buildProductContext lookup fallback에 사용.
 *
 * v3 (사이클 2 — 라벨 누수 차단):
 * - 5분할 필드를 **라벨 없는** 자연스러운 한국어로 합성. 시드 6개의 톤과 일치.
 * - 신상품 컨텍스트(hasReviews=false)는 ProductInfo에 평문 전달 → product-placement.ts가 분기 처리.
 * - expectedReactions는 라벨 제거하고 평문 그대로 realReviews 자리에 주입. 본문 누수 위험 차단.
 */
export function buildCustomProductInfo(p: UserProduct): ProductInfo {
  const composedAdvantages = composeAdvantagesNatural(p);
  // [예상 반응] 라벨 제거 — 평문 그대로 넘김. 신상품 헤더는 product-placement.ts에서 섹션 단위로 감쌈.
  const reviewsForPrompt =
    p.hasReviews === false
      ? (p.expectedReactions ?? [])
      : p.realReviews;

  return {
    id: p.id,
    name: p.name,
    category: p.category,
    defaultAdvantages: composedAdvantages,
    relatedSymptoms: p.relatedSymptoms,
    naturalMentionPatterns: p.naturalMentionPatterns,
    keyInsight: p.keyInsight,
    sensoryDetails: p.sensoryDetails,
    realReviews: reviewsForPrompt,
    // 사이클 2/3 — 신상품 분기 + precautions만 유지 (4칸은 사이클 3에서 제거)
    hasReviews: p.hasReviews,
    precautions: p.precautions,
  };
}

/**
 * 5분할 필드를 **라벨 없는** 자연스러운 한국어 텍스트로 합친다 (사이클 2 핵심).
 *
 * 회귀 방지 핵심:
 * - 시드 6개의 defaultAdvantages는 라벨 없이 자연스러운 한국어 문장 모음.
 * - 라벨("[효능·기대 효과]" 등)을 본문에 박으면 LLM이 형식을 본문에 그대로 베껴 쓰는 경향.
 * - 따라서 5칸을 단순히 빈 줄로 연결해 자연스러운 텍스트 블록으로 만든다.
 *
 * 우선순위:
 *  1. 5분할 중 하나라도 채워져 있으면 그것만으로 재조립 (라벨 없음)
 *  2. 5분할이 전부 비었으면 기존 defaultAdvantages 그대로 사용 (레거시 호환)
 *
 * 폼 측에서도 동일 합성 결과를 defaultAdvantages에 저장 → step 1 장점 편집 다이얼로그 빈 화면 방지.
 */
export function composeAdvantagesNatural(p: UserProduct): string {
  const parts: string[] = [];
  if (p.efficacy?.trim()) parts.push(p.efficacy.trim());
  if (p.ingredients?.trim()) parts.push(p.ingredients.trim());
  if (p.usability?.trim()) parts.push(p.usability.trim());
  if (p.differentiator?.trim()) parts.push(p.differentiator.trim());
  if (p.usage?.trim()) parts.push(p.usage.trim());

  if (parts.length === 0) {
    return p.defaultAdvantages ?? "";
  }
  return parts.join("\n\n");
}
