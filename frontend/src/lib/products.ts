import type { ProductId } from "@/types";

/**
 * 공용 제품 기본 정보
 * 서버(brand-context.ts)와 클라이언트(step-product-select.tsx) 모두 이 파일에서 임포트
 */
export interface ProductBase {
  id: ProductId;
  name: string;
  category: string;
  defaultAdvantages: string;
}

export const PRODUCTS: ProductBase[] = [
  {
    id: "hair-loss-shampoo",
    name: "탈모샴푸",
    category: "헤어케어",
    defaultAdvantages:
      "두피 자극이 적고 약산성이라 민감한 두피에도 부담 없음. 거품이 부드럽게 올라오고 씻은 후 두피가 편안한 느낌. 꾸준히 사용하면 두피 환경이 안정되는 느낌.",
  },
  {
    id: "therapy-shampoo",
    name: "테라피샴푸",
    category: "헤어케어",
    defaultAdvantages:
      "예민해진 두피를 진정시켜주는 느낌. 트러블이 있는 두피에도 자극 없이 사용 가능. 꾸준히 쓰면 두피가 안정되는 느낌.",
  },
  {
    id: "body-lotion",
    name: "바디로션",
    category: "바디케어",
    defaultAdvantages:
      "끈적이지 않고 흡수가 빨라서 부담 없음. 샤워 후 바로 발라주면 촉촉함이 오래 유지됨. 자극 없어서 민감한 피부에도 편안한 느낌.",
  },
  {
    id: "soap",
    name: "솝",
    category: "바디케어",
    defaultAdvantages:
      "거품이 부드럽게 올라오고 피부에 닿아도 따끔한 느낌이 없음. 씻고 나서도 당기지 않고 편안한 느낌. 자극 없이 깨끗하게 씻기는 느낌.",
  },
  {
    id: "scalp-brush",
    name: "두피브러쉬",
    category: "헤어케어 도구",
    defaultAdvantages:
      "샴푸할 때 같이 쓰면 두피가 시원하고 개운한 느낌. 자극 없이 두피 노폐물이 잘 빠지는 느낌. 손으로만 감을 때보다 확실히 깨끗한 느낌.",
  },
  {
    id: "hair-tonic",
    name: "헤어토닉",
    category: "헤어케어",
    defaultAdvantages:
      "샴푸 후 뿌려주면 두피가 시원하고 상쾌한 느낌. 꾸준히 쓰면 모발에 힘이 생기는 느낌. 끈적이지 않아서 매일 쓰기 부담 없음.",
  },
];

export function getProductByIdFromBase(id: string): ProductBase | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
