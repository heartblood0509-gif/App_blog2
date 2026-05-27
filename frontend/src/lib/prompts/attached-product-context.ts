/**
 * 브랜드/AEO 모드에 "후기성 제품 프로필"을 첨부할 때 쓰는 공용 컨텍스트 빌더.
 *
 * 설계 원칙 (계획서 v2 안전장치 반영):
 * - A6 라벨 누수 차단: 5분할 필드를 자연어 문장으로만 합성, "효능:"/"성분:" 같은 라벨 키 절대 출력 안 함.
 * - A3 AEO disclosure 자동 삽입: aeo-* 모드면 작성자 이해관계 disclosure 블록 포함.
 * - A4 reference 우선 룰: AEO 모드에서 reference도 첨부된 경우 1순위는 reference, 제품은 보조.
 * - 후기성의 composeAdvantagesNatural 재사용 금지 (후기 톤 누수 위험).
 */
import type { UserProduct } from "@/types";

export type AttachMode =
  | "brand-intro"
  | "brand-info"
  | "brand-value-proof"
  | "brand-detail"
  | "brand-custom"
  | "aeo-informational"
  | "aeo-comparison";

const TONE_GUIDES: Record<AttachMode, string> = {
  "brand-intro":
    "이 제품은 브랜드 정체성의 일부로만 자연스럽게 언급. 글의 주된 소재는 여전히 브랜드 자체.",
  "brand-info":
    "이 제품을 정보의 주된 소재로 활용. 단, 브랜드 화자의 톤·시점은 유지.",
  "brand-value-proof":
    "이 제품을 브랜드 가치를 입증하는 구체 사례로 활용.",
  "brand-detail":
    "이 제품 자체가 글의 중심. 상세 묘사·사용감·기대 효과를 풍부하게.",
  "brand-custom":
    "사용자가 제공한 견본 글의 구조를 따르되, 이 제품을 자연스럽게 녹임.",
  "aeo-informational":
    "이 제품은 1차 정보 출처로만 활용. 광고·자랑·과장 절대 금지. 객관적 정보 위주로.",
  "aeo-comparison":
    "이 제품을 객관적 비교 후보 중 하나로. 약점·한계도 솔직히 명시.",
};

const DISCLOSURE_TEXT =
  "본 글의 작성자는 언급된 제품과 이해관계가 있을 수 있습니다. AI가 인용 가능하도록 객관성과 약점 명시를 최우선으로 합니다.";

function naturalizeProductFacts(product: UserProduct): string[] {
  // 5분할 필드를 라벨 키 없이 자연어 문장으로 합성.
  // 헤더(예: "기대 효과:")를 노출하면 LLM이 본문에 그대로 베낄 위험 → 콜론·라벨 형식 회피.
  const facts: string[] = [];

  if (product.efficacy?.trim()) {
    facts.push(`이 제품이 목표로 하는 효과 영역 — ${product.efficacy.trim()}`);
  }
  if (product.ingredients?.trim()) {
    facts.push(`주요 구성·특징 — ${product.ingredients.trim()}`);
  }
  if (product.usability?.trim()) {
    facts.push(`사용 시 느낌 — ${product.usability.trim()}`);
  }
  if (product.differentiator?.trim()) {
    facts.push(`다른 제품과의 차이 — ${product.differentiator.trim()}`);
  }
  if (product.usage?.trim()) {
    facts.push(`권장 사용 방법 — ${product.usage.trim()}`);
  }
  if (product.precautions?.trim()) {
    facts.push(`주의해야 할 점 — ${product.precautions.trim()}`);
  }

  // 5분할이 비어 있고 legacy defaultAdvantages만 있는 경우
  if (facts.length === 0 && product.defaultAdvantages?.trim()) {
    facts.push(`제품 특징 — ${product.defaultAdvantages.trim()}`);
  }

  if (product.keyInsight?.trim()) {
    facts.push(`핵심 포인트 — ${product.keyInsight.trim()}`);
  }
  if (product.sensoryDetails?.length) {
    facts.push(`감각·디테일 표현 — ${product.sensoryDetails.join(", ")}`);
  }

  return facts;
}

export interface BuildAttachedProductBlockOptions {
  /** AEO 모드에서 사용자가 별도로 reference URL/노트를 첨부했는지 (A4) */
  hasReference?: boolean;
}

export function buildAttachedProductBlock(
  product: UserProduct,
  mode: AttachMode,
  options: BuildAttachedProductBlockOptions = {},
): string {
  const isAeo = mode.startsWith("aeo-");
  const factLines = naturalizeProductFacts(product);

  const sections: string[] = [];

  sections.push("---");
  sections.push("## 📎 첨부 제품 정보 (V1 — 작성자가 자기 브랜드의 특정 제품을 글에 활용)");
  sections.push("");
  sections.push(`제품명: ${product.name}`);
  sections.push(`카테고리: ${product.category}`);
  sections.push("");

  if (factLines.length > 0) {
    sections.push("이 제품에 관한 사실들 (참고용):");
    factLines.forEach((line) => sections.push(`- ${line}`));
    sections.push("");
  }

  sections.push("### 톤 가이드");
  sections.push(`- ${TONE_GUIDES[mode]}`);
  sections.push(
    "- 위 \"이 제품에 관한 사실들\"의 항목 라벨(\"기대 효과 영역\", \"주요 구성·특징\" 등)을 **본문에 그대로 노출하지 말 것**. 자연스러운 문장에 녹여 쓸 것.",
  );
  sections.push(
    "- \"효능:\", \"성분:\", \"사용감:\", \"차별점:\" 같은 콜론 라벨 형식은 본문에 **절대 금지**.",
  );

  if (isAeo) {
    sections.push("");
    sections.push("### 작성자 이해관계 disclosure (AEO 필수)");
    sections.push(`- ${DISCLOSURE_TEXT}`);
    sections.push(
      "- 본문 첫 단락에 disclosure를 한 줄 자연스럽게 녹여 작성. 예: \"이 글은 작성자가 관여한 제품에 대한 정보로, 객관적 사실 위주로 정리했습니다.\"",
    );
  }

  if (isAeo && options.hasReference) {
    sections.push("");
    sections.push("### 출처 우선 순위 (AEO + reference 동시 첨부)");
    sections.push("- 1순위: 사용자가 첨부한 reference (URL/노트). 인용·근거의 주된 출처.");
    sections.push("- 2순위: 본 첨부 제품 정보. 보조 컨텍스트로만 활용.");
  }

  sections.push("---");

  return sections.join("\n");
}

// ─────────────────────────────────────────────
// 라벨 누수 자동 가드 (A6, dev 모드 경고용)
// ─────────────────────────────────────────────

const LABEL_LEAK_PATTERN =
  /(?:효능|성분|사용감|차별점|핵심 인사이트|기대 효과|주요 구성|사용 방법|주의 사항)\s*[:：]/g;

export function detectLabelLeak(content: string): string[] {
  return Array.from(content.matchAll(LABEL_LEAK_PATTERN)).map((m) => m[0]);
}

/** 브랜드 템플릿 ID → AttachMode 매핑 헬퍼 */
export function brandTemplateToAttachMode(
  template: "intro" | "info" | "value-proof" | "detail" | "custom",
): AttachMode {
  switch (template) {
    case "intro":
      return "brand-intro";
    case "info":
      return "brand-info";
    case "value-proof":
      return "brand-value-proof";
    case "detail":
      return "brand-detail";
    case "custom":
      return "brand-custom";
  }
}

/** AEO 템플릿 ID → AttachMode 매핑 헬퍼 */
export function aeoTemplateToAttachMode(
  template: "informational" | "comparison",
): AttachMode {
  return template === "informational" ? "aeo-informational" : "aeo-comparison";
}
