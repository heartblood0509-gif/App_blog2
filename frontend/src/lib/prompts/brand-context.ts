import type { ProductInfo } from "@/types";
import { PRODUCTS } from "@/lib/products";

// 공용 제품 기본 정보에 서버 전용 확장 정보를 추가
export const BRAND_PRODUCTS: Record<string, ProductInfo> = {
  "hair-loss-shampoo": {
    ...PRODUCTS.find((p) => p.id === "hair-loss-shampoo")!,
    relatedSymptoms: [
      "탈모",
      "머리카락 빠짐",
      "두피 가려움",
      "두피 각질",
      "두피 냄새",
      "머리숱 감소",
    ],
    naturalMentionPatterns: [
      "요즘 쓰고 있는 샴푸",
      "지인 추천으로 써보기 시작한",
      "우연히 바꿔보게 된",
      "맘카페에서 후기 보고 바꿔본",
    ],
    ingredientPoints: ["두피 보습", "자극 적은", "약산성", "두피 진정"],
  },
  "therapy-shampoo": {
    ...PRODUCTS.find((p) => p.id === "therapy-shampoo")!,
    relatedSymptoms: [
      "두피 트러블",
      "두피 붉음",
      "두피 열감",
      "비듬",
      "지루성 두피",
      "두피 뾰루지",
    ],
    naturalMentionPatterns: [
      "두피 진정용으로 바꿔본",
      "예민해진 두피에 써보기 시작한",
      "피부과 다니면서 같이 써본",
    ],
    ingredientPoints: ["두피 진정", "트러블 케어", "순한 세정", "두피 밸런스"],
  },
  "body-lotion": {
    ...PRODUCTS.find((p) => p.id === "body-lotion")!,
    relatedSymptoms: [
      "건조한 피부",
      "가드름",
      "바디 트러블",
      "피부 당김",
      "각질",
      "가려움",
    ],
    naturalMentionPatterns: [
      "샤워 후 바로 바르기 시작한",
      "바디워시랑 같이 바꿔본",
      "보습용으로 찾다가 알게 된",
    ],
    ingredientPoints: ["보습", "피부 장벽", "자극 없는", "흡수 빠른"],
  },
  soap: {
    ...PRODUCTS.find((p) => p.id === "soap")!,
    relatedSymptoms: [
      "피부 자극",
      "건조함",
      "바디 트러블",
      "예민한 피부",
      "아토피",
    ],
    naturalMentionPatterns: [
      "바디워시 대신 써보기 시작한",
      "자극 덜한 걸로 찾다가",
      "순한 세정이 필요해서 바꿔본",
    ],
    ingredientPoints: ["순한 세정", "약산성", "보습 유지", "자극 최소화"],
  },
  "scalp-brush": {
    ...PRODUCTS.find((p) => p.id === "scalp-brush")!,
    relatedSymptoms: [
      "두피 각질",
      "두피 노폐물",
      "샴푸 세정력 부족",
      "두피 마사지",
      "혈액순환",
    ],
    naturalMentionPatterns: [
      "샴푸할 때 같이 쓰기 시작한",
      "두피 관리하면서 추가한",
      "세정력 올리려고 써본",
    ],
    ingredientPoints: ["두피 자극 없는 소재", "적절한 강도", "세정 보조"],
  },
  "hair-tonic": {
    ...PRODUCTS.find((p) => p.id === "hair-tonic")!,
    relatedSymptoms: [
      "두피 건조",
      "탈모 예방",
      "두피 영양",
      "모발 힘 없음",
      "두피 보습",
    ],
    naturalMentionPatterns: [
      "샴푸 후 마무리로 쓰기 시작한",
      "두피 관리 루틴에 추가한",
      "토닉까지 쓰니까 달라진 느낌",
    ],
    ingredientPoints: ["두피 영양", "모근 강화", "두피 보습", "청량감"],
  },
};

export function getProductById(id: string): ProductInfo | undefined {
  return BRAND_PRODUCTS[id];
}

export function getProductNames(ids: string[]): string[] {
  return ids
    .map((id) => BRAND_PRODUCTS[id]?.name)
    .filter(Boolean) as string[];
}
