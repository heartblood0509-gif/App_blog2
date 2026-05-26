import type { ProductInfo, SelectedProduct } from "@/types";
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
  selectedProducts: SelectedProduct[],
  customProductInfoById: Record<string, ProductInfo> = {}
): string {
  if (selectedProducts.length === 0) return "";

  const lines = selectedProducts.map((sp) => {
    const product = BRAND_PRODUCTS[sp.id] ?? customProductInfoById[sp.id];
    if (!product) return "";

    const isNewLaunch = product.hasReviews === false;

    let section = `### 제품: ${product.name}
- 카테고리: ${product.category}
- 관련 증상/고민: ${product.relatedSymptoms.join(", ")}
- 자연스러운 언급 패턴: ${product.naturalMentionPatterns.map((p) => `"${p}"`).join(", ")}
- 이 제품의 장점: ${sp.advantages || product.defaultAdvantages}`;

    if (product.keyInsight) {
      section += `\n- 핵심 방향성: ${product.keyInsight}`;
    }

    if (product.sensoryDetails?.length) {
      section += `\n- 감각 표현 참고 (이 느낌을 자연스럽게 녹일 것): ${product.sensoryDetails.join(" / ")}`;
    }

    // ─────── 후기 섹션 — 신상품 여부에 따라 헤더 분기 (사이클 2) ───────
    if (product.realReviews?.length) {
      if (isNewLaunch) {
        section += `\n- ⚠️ 신규 출시 제품 — 아직 실제 누적 후기 없음. 아래는 **예상되는 사용자 반응**이며 단정적 후기 톤(예: "써봤더니 정말 좋았어요")으로 작성 금지. "이런 톤·방향이 어울리겠다" 정도의 가이드로만 활용:`;
      } else {
        section += `\n- 실제 사용자 톤 참고 (직접 복사하지 말고 이런 톤으로 작성할 것):`;
      }
      product.realReviews.forEach((r) => {
        section += `\n  "${r}"`;
      });
    }

    // ─────── 사이클 3 — precautions만 유지 (4칸은 시드·서사 템플릿이 이미 커버하므로 제거) ───────
    if (product.precautions?.trim()) {
      section += `\n- 안 맞을 수 있는 케이스 (신뢰도 단락에 자연스럽게 명시 — 광고스러움 회피): ${product.precautions.trim()}`;
    }

    return section;
  });

  // 신상품 포함 여부 확인 (전체 가드 문구 강화용)
  const hasAnyNewLaunch = selectedProducts.some((sp) => {
    const product = BRAND_PRODUCTS[sp.id] ?? customProductInfoById[sp.id];
    return product?.hasReviews === false;
  });

  return `## 제품 정보 (글에 자연스럽게 녹일 것)
${lines.join("\n\n")}

중요:
- 위 정보를 글에 직접 나열하지 말 것
- 위 항목 이름(예: "효능", "성분", "차별 포인트", "안 맞을 수 있는 케이스")을 본문에 헤더·라벨로 노출 금지. 모든 정보는 자연스러운 1인칭 후기 톤으로 녹일 것
- 실제 후기 문장을 그대로 복사하지 말 것
- 비슷한 톤과 감각으로 새로운 표현을 만들어서 자연스러운 경험 속에 녹일 것
- 핵심 방향성을 이해하고 그 방향으로 글을 전개할 것${
    hasAnyNewLaunch
      ? `
- ⚠️ 신규 출시 제품이 포함되어 있음 — "예상되는 사용자 반응"은 실제 후기가 아니므로 "써봤더니 정말 좋았어요" 같은 단정적 표현 금지. "이런 흐름으로 느껴질 듯", "꾸준히 쓰면 차이가 보일 타입" 정도의 추정 톤으로`
      : ""
  }`;
}
