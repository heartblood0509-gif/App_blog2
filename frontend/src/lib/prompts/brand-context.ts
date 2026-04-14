import type { ProductInfo } from "@/types";
import { PRODUCTS } from "@/lib/products";

export const BRAND_PRODUCTS: Record<string, ProductInfo> = {
  "therapy-shampoo": {
    ...PRODUCTS.find((p) => p.id === "therapy-shampoo")!,
    relatedSymptoms: ["두피 트러블", "두피 붉음", "두피 열감", "비듬", "지루성 두피", "두피 뾰루지"],
    naturalMentionPatterns: ["두피 진정용으로 바꿔본", "예민해진 두피에 써보기 시작한", "피부과 다니면서 같이 써본"],
    ingredientPoints: ["두피 진정", "트러블 케어", "순한 세정", "두피 밸런스"],
    keyInsight: "자극으로 눌러주는 게 아니라 두피 상태 자체를 편하게 만들어주는 타입",
    sensoryDetails: ["당김 없이 촉촉함 유지", "간지러움이 확실히 덜한 느낌", "두피가 편안한 상태가 오래 유지", "린스 없어도 될 정도로 부드러운 마무리감"],
    realReviews: [
      "처음엔 그냥 순한 샴푸인가 했는데 며칠 지나니까 밤에 긁는 횟수가 확 줄어듦",
      "운동하고 땀 흘린 날에도 예전처럼 바로 올라오는 느낌이 덜함",
      "샴푸하고 1~2분 놔두고 쓰니까 확실히 차이 느껴짐",
    ],
  },
  "hair-loss-shampoo": {
    ...PRODUCTS.find((p) => p.id === "hair-loss-shampoo")!,
    relatedSymptoms: ["탈모", "머리카락 빠짐", "두피 가려움", "두피 각질", "두피 냄새", "머리숱 감소"],
    naturalMentionPatterns: ["요즘 쓰고 있는 샴푸", "지인 추천으로 써보기 시작한", "우연히 바꿔보게 된", "맘카페에서 후기 보고 바꿔본"],
    ingredientPoints: ["두피 보습", "자극 적은", "약산성", "두피 진정"],
    keyInsight: "탈모를 잡는다보다 빠질 환경을 줄이는 방향으로 접근하는 타입",
    sensoryDetails: ["개운함은 있는데 건조하지 않음", "두피 열감 간지러움이 줄면서 전체적인 두피 컨디션 안정", "기존 탈모샴푸 특유의 뻣뻣함이 덜함"],
    realReviews: [
      "머리 빠지는 건 바로 줄진 않는데 두피가 덜 자극받으니까 덜 빠지는 느낌",
      "기존 탈모샴푸처럼 뻣뻣하거나 떡지는 느낌 없음",
      "꾸준히 썼을 때 차이가 나는 쪽",
    ],
  },
  "scalp-brush": {
    ...PRODUCTS.find((p) => p.id === "scalp-brush")!,
    relatedSymptoms: ["두피 각질", "두피 노폐물", "샴푸 세정력 부족", "두피 마사지", "혈액순환"],
    naturalMentionPatterns: ["샴푸할 때 같이 쓰기 시작한", "두피 관리하면서 추가한", "세정력 올리려고 써본"],
    ingredientPoints: ["두피 자극 없는 소재", "적절한 강도", "세정 보조"],
    keyInsight: "세게 긁는 습관을 제대로 씻는 습관으로 바꿔주는 도구",
    sensoryDetails: ["손톱 대신 쓰니까 상처 없이 시원함", "샴푸 거품이 골고루 퍼지게 도와줌", "각질 쌓이는 부위까지 부드럽게 풀어줌", "뒤통수 정수리 쪽 평소 못 씻던 느낌까지 풀림"],
    realReviews: [
      "처음엔 그냥 시원한 정도였는데 계속 쓰다 보니까 두피가 덜 뒤집힘",
      "샴푸만 쓸 때보다 개운함이 확실히 다름",
      "긁는 게 아니라 마사지하는 느낌이라 부담 없음",
    ],
  },
  "body-lotion": {
    ...PRODUCTS.find((p) => p.id === "body-lotion")!,
    relatedSymptoms: ["건조한 피부", "가드름", "바디 트러블", "피부 당김", "각질", "가려움"],
    naturalMentionPatterns: ["샤워 후 바로 바르기 시작한", "바디워시랑 같이 바꿔본", "보습용으로 찾다가 알게 된"],
    ingredientPoints: ["보습", "피부 장벽", "자극 없는", "흡수 빠른"],
    keyInsight: "촉촉함보다 불편함 없는 상태 유지에 가까운 타입",
    sensoryDetails: ["시간 지나도 편한 상태 유지", "끈적임 없이 흡수 빠르고 생활에 부담 없음", "샤워 후 당김이나 가려움이 확실히 줄어드는 쪽", "향이 과하지 않아서 계속 써도 질리지 않음"],
    realReviews: [
      "샤워하고 나서 바로 긁던 게 없어짐",
      "밤에 건조해서 깨는 일이 줄어듦",
      "촉촉하다기보다 그냥 피부가 신경 안 쓰이는 상태",
    ],
  },
  "hair-tonic": {
    ...PRODUCTS.find((p) => p.id === "hair-tonic")!,
    relatedSymptoms: ["두피 건조", "탈모 예방", "두피 영양", "모발 힘 없음", "두피 보습"],
    naturalMentionPatterns: ["샴푸 후 마무리로 쓰기 시작한", "두피 관리 루틴에 추가한", "토닉까지 쓰니까 달라진 느낌"],
    ingredientPoints: ["두피 영양", "모근 강화", "두피 보습", "청량감"],
    keyInsight: "샴푸로 못 잡는 걸 마무리해주는 보완 역할",
    sensoryDetails: ["두피에 바로 들어가서 열감이 내려가는 느낌", "진정 느낌 빠르게 옴", "가려움 열감 올라올 때 즉각적으로 정리되는 느낌"],
    realReviews: [
      "샴푸만으로 부족했던 부분이 채워지는 느낌",
      "운동 후나 더운 날 쓰면 체감 확 옴",
      "꾸준히 쓰니까 두피 예민함 자체가 줄어듦",
    ],
  },
  soap: {
    ...PRODUCTS.find((p) => p.id === "soap")!,
    relatedSymptoms: ["피부 자극", "건조함", "바디 트러블", "예민한 피부", "아토피"],
    naturalMentionPatterns: ["바디워시 대신 써보기 시작한", "자극 덜한 걸로 찾다가", "순한 세정이 필요해서 바꿔본"],
    ingredientPoints: ["순한 세정", "약산성", "보습 유지", "자극 최소화"],
    keyInsight: "세정은 되는데 건조하게 땡기지 않는 타입",
    sensoryDetails: ["트러블 올라오는 부위에도 부담 없이 사용 가능", "향이 과하지 않고 깔끔한 느낌", "바디워시보다 간결하고 덜 자극적인 느낌"],
    realReviews: [
      "씻고 나서 바로 당기는 느낌이 없음",
      "등드름 가드름 부위에 써도 부담 없음",
      "향도 과하지 않아서 계속 쓰기 편함",
    ],
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
