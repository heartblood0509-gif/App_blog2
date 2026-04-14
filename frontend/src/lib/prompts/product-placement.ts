import type { SelectedProduct } from "@/types";
import { BRAND_PRODUCTS } from "./brand-context";

/**
 * 제품 배치 규칙
 * 후기성 블로그에서 제품을 자연스럽게 녹이는 방법
 */

export const PRODUCT_PLACEMENT_RULES = `## 제품 배치 규칙 (자연스러운 언급이 핵심)

### 배치 위치
- 글의 60~70% 지점에서 첫 언급 (해결 단계에서)
- 글의 앞부분(0~30%)에서는 절대 제품 언급 금지
- 전체 글에서 최대 1~2회만 자연스럽게 언급

### 4단계 자연 도입법 (이 순서를 따를 것)
1. **필요성 인식**: "그래서 ○○를 바꿔야겠다고 생각했음"
2. **탐색 과정**: "이것저것 찾아보다가", "후기를 읽어봤는데"
3. **우연한 발견**: "우연히 알게 됐는데", "괜찮지 않을까 싶어서 바꿔봤어요"
4. **자연스러운 결과**: "쓰다 보니 계속 쓰게 됐음", "은근 계속 쓰게 만드는 포인트였음"

### 언급 톤
- "우연히 쓰게 됐는데 계속 쓰게 됐음" (가장 이상적)
- "괜찮지 않을까 싶어서 바꿔봤어요"
- "순하다는 얘기가 많더라고요"
- 절대 "이 제품이 최고다", "이거 꼭 써봐라" 톤 금지

### 성분/효능 언급
- 성분 설명은 간단히, 1~2줄 이내
- "그래서 그런가 싶었음" 정도의 톤 유지
- 처음엔 몰랐다가 나중에 찾아봤다는 흐름
- 과장 없이 담백하게

### 병원/연고 언급
- 처음에는 병원이나 연고와 함께 사용
- 나중에는 제품만 사용하게 되는 흐름
- 현실적인 선택 강조 (비용, 시간 등 고려)`;

export function buildProductContext(
  selectedProducts: SelectedProduct[]
): string {
  if (selectedProducts.length === 0) return "";

  const lines = selectedProducts.map((sp) => {
    const product = BRAND_PRODUCTS[sp.id];
    if (!product) return "";
    return `### 제품: ${product.name}
- 카테고리: ${product.category}
- 관련 증상/고민: ${product.relatedSymptoms.join(", ")}
- 자연스러운 언급 패턴 예시: ${product.naturalMentionPatterns.map((p) => `"${p}"`).join(", ")}
- 성분 포인트 (간단히만 언급): ${product.ingredientPoints.join(", ")}
- 이 제품의 장점: ${sp.advantages || product.defaultAdvantages}`;
  });

  return `## 제품 정보 (글에 자연스럽게 녹일 것)
${lines.join("\n\n")}

중요: 위 제품 정보는 글에 직접적으로 나열하지 말 것. 자연스러운 경험 속에서 녹여내야 함.`;
}
