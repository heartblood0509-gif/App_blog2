import { describe, it, expect } from "vitest";
import { buildAttachedProductBlock } from "../attached-product-context";
import type { UserProduct } from "@/types";

const PRODUCT: UserProduct = {
  id: "prod1",
  name: "미르엔 샴푸",
  category: "민감 두피 샴푸",
  defaultAdvantages: "",
  relatedSymptoms: [],
  naturalMentionPatterns: [],
  keyInsight: "",
  sensoryDetails: [],
  realReviews: ["미르엔 샴푸 쓰고 두피 진정됐어요", "재구매 의사 100%"],
  hasReviews: true,
  efficacy: "두피 진정",
};

describe("buildAttachedProductBlock — Part 5", () => {
  it("정보성글(brand-info): 제품명 비노출 + 후기 sanitizer로 브랜드명 제거", () => {
    const block = buildAttachedProductBlock(PRODUCT, "brand-info", { brandName: "미르엔" });
    expect(block).not.toContain("제품명: 미르엔 샴푸");
    expect(block).toContain("제품 분류");
    // 후기는 포함되되 브랜드/제품명은 제거됨
    expect(block).toContain("두피 진정됐어요");
    expect(block).not.toContain("미르엔");
    expect(block).toContain("제품명·브랜드명은 본문에 노출 금지");
  });

  it("상세페이지글(brand-detail): 제품명 노출 + 후기 실명 인용", () => {
    const block = buildAttachedProductBlock(PRODUCT, "brand-detail", { brandName: "미르엔" });
    expect(block).toContain("제품명: 미르엔 샴푸");
    expect(block).toContain("실제 사용자 후기·사례");
    expect(block).toContain("미르엔 샴푸 쓰고 두피 진정됐어요");
  });

  it("신상품(hasReviews=false): expectedReactions를 예상 반응으로 사용", () => {
    const newProduct: UserProduct = {
      ...PRODUCT,
      hasReviews: false,
      realReviews: [],
      expectedReactions: ["순하게 감기는 느낌일 것"],
    };
    const block = buildAttachedProductBlock(newProduct, "brand-detail");
    expect(block).toContain("예상 사용자 반응");
    expect(block).toContain("순하게 감기는 느낌일 것");
  });
});
