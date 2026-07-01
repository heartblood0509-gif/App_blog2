/**
 * 브랜드 모드 제목 생성 프롬프트 빌더.
 *
 * 설계 원칙:
 * - 카드별 titleFormula(톤 견본)를 학습 가이드로 사용. LLM은 그대로 베끼지 말고 변형해서 새 5개 작성.
 * - 가드레일(메인키워드 위치·문장부호·추상어 금지·정보성글 회사명 금기)은 절대 깨지 않음.
 * - 본문 생성과 완전히 분리. titleFormula는 본문 빌더에 절대 흘러가지 않음.
 * - 1차 작업 범위: 정보성글(info)만. intro/value-proof/detail은 사용자가 공식 전달 후 확장.
 */
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  AnalysisRecord,
  BrandTitleFormula,
} from "@/types/brand";
import {
  BRAND_TITLE_BASE_RULES,
  BRAND_TITLE_BASE_RULES_EXPRESSIVE,
  BRAND_TITLE_BASE_RULES_NO_KEYWORD,
  BRAND_TITLE_ZERO_EXPOSURE_RULES,
} from "./shared";

/**
 * 문장부호 허용 구조 화이트리스트 — 강한 폭로톤 구조만 여기에 추가.
 * 라벨 매칭이므로 시드 라벨과 정확히 일치해야 함.
 */
const PUNCTUATION_ALLOWED_STRUCTURES = new Set<string>([
  "업계 내부고발형",
]);

// ─────────────────────────────────────────────
// 키워드 유무 분기 헬퍼 — intro/value-proof/detail 빌더 공용.
// 메인 키워드가 비면(소개·가치입증·상세에서 미입력) 제목을 키워드가 아닌
// '주제(topic)' 중심으로 짓도록 [과제]·기본규칙·검산 조각을 바꾼다.
// info/custom은 항상 키워드가 차 있어 기존 문구와 동일하게 동작한다.
// ─────────────────────────────────────────────

/** 헤더 도입구 — 키워드 있으면 "키워드에 맞춰", 없으면 톤·다양성 중심(긍정형). */
function headerLead(mainKeyword: string): string {
  return mainKeyword?.trim()
    ? "메인 키워드에 맞춰"
    : "예시 톤에 맞춰, 서로 다른 각도로";
}

/**
 * [과제] 첫 문장 — 키워드·주제 유무로 3분기.
 * 키워드 없을 때는 "각 제목을 서로 다른 각도·첫머리로 시작하라"는 긍정 지시로 다양성을 유도.
 */
function taskHeadline(
  mainKeyword: string,
  topic: string | null | undefined,
  articleLabel: string,
  count: number
): string {
  const kw = mainKeyword?.trim();
  if (kw) {
    return `"${kw}"를 첫 단어로 한 ${articleLabel} ${count}개를 작성하라.`;
  }
  if (topic && topic.trim()) {
    return `아래 [글 도메인]의 주제를 중심으로 ${articleLabel} ${count}개를 지어라.
주제 문장을 그대로 베끼지 말고, 그 의미·의도를 살린 새 제목으로 만들어라.
${count}개 제목은 각각 서로 다른 각도·서로 다른 첫머리로 시작하게 하라.`;
  }
  return `노출 키워드도 지정 주제도 없다. 이 브랜드의 견본 톤과 템플릿 성격에 맞춰 ${articleLabel} ${count}개를 자유롭게 지어라.
각 제목을 서로 다른 각도(예: 결과·사례·희망·현실 고민 등)에서, 서로 다른 첫머리로 시작하게 하라.
브랜드 분야(카테고리)는 배경 맥락으로만 활용하라.`;
}

/** 반환 필드 title 설명 — 키워드 없으면 "다양한 도입" 긍정 안내. */
function titleFieldDesc(mainKeyword: string): string {
  return mainKeyword?.trim()
    ? "- title: 메인 키워드로 시작하는 제목 문장"
    : "- title: 서로 다른 각도로 시작하는 자연스러운 제목 문장";
}

/** 기본 규칙 — 키워드 없으면 "맨 앞 고정" 규칙을 뺀 버전. */
function titleBaseRules(mainKeyword: string): string {
  return mainKeyword?.trim()
    ? BRAND_TITLE_BASE_RULES
    : BRAND_TITLE_BASE_RULES_NO_KEYWORD;
}

/** 검산 1번 항목 — 키워드 없으면 "서로 다른 첫머리로 시작" 긍정 검사. */
function startsWithCheck(mainKeyword: string): string {
  const kw = mainKeyword?.trim();
  return kw
    ? `모든 title이 "${kw}"로 시작하는가?`
    : "5개 제목이 각각 다른 첫머리·다른 각도로 시작하는가?";
}

export interface BuildBrandTitlePromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: BrandInfoVariantId | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  count?: number;
  /** Step 2에서 사용자가 고른 분석 카드. titleFormula가 있으면 그 톤 견본을 학습 가이드로 사용 */
  analysisRecord?: AnalysisRecord | null;
}

/**
 * 메인 진입점. 정보성글·소개글 지원, 나머지 템플릿은 null.
 *
 * @returns Gemini에 보낼 프롬프트 문자열, 또는 null(이 템플릿은 아직 미지원)
 */
export function buildBrandTitlePrompt(
  opts: BuildBrandTitlePromptOptions
): string | null {
  if (opts.template === "info") {
    const formula = opts.analysisRecord?.titleFormula;
    if (formula) {
      return buildFormulaBasedInfoPrompt(opts, formula);
    }
    return buildInfoFallbackPrompt(opts);
  }

  if (opts.template === "intro") {
    const formula = opts.analysisRecord?.titleFormula;
    if (formula) {
      return buildFormulaBasedIntroPrompt(opts, formula);
    }
    return buildIntroFallbackPrompt(opts);
  }

  if (opts.template === "value-proof") {
    const formula = opts.analysisRecord?.titleFormula;
    if (formula) {
      return buildFormulaBasedValueProofPrompt(opts, formula);
    }
    return buildValueProofFallbackPrompt(opts);
  }

  if (opts.template === "detail") {
    const formula = opts.analysisRecord?.titleFormula;
    if (formula) {
      return buildFormulaBasedDetailPrompt(opts, formula);
    }
    return buildDetailFallbackPrompt(opts);
  }

  return null;
}

// ─────────────────────────────────────────────
// 정보성글 — 톤 견본(titleFormula) 기반 프롬프트
// ─────────────────────────────────────────────

function buildFormulaBasedInfoPrompt(
  opts: BuildBrandTitlePromptOptions,
  formula: BrandTitleFormula
): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const patternsBlock = formula.patterns
    .map((p, i) => `${i + 1}. (${p.label}) "${p.tail}"`)
    .join("\n");

  const sections: string[] = [];

  sections.push(`당신은 한국어 정보성 블로그의 제목을 짓는 카피라이터입니다.
아래 톤 견본을 학습한 뒤, 메인 키워드에 맞춰 새 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[구조 — ${formula.structureLabel}]
공식 흐름: ${formula.formula}`);

  sections.push(`[허용 감정 — 화이트리스트]
${formula.emotions.join(" · ")}
※ 이 감정 범위 밖의 톤은 절대 사용하지 마라. 다른 감정으로 가면 구조 정체성이 무너진다.`);

  sections.push(`[톤 견본 패턴 — 학습용]
${patternsBlock}

※ 위 견본은 "이 결로 써라"는 가이드일 뿐이다.
※ 견본 문장을 그대로 복사하지 마라. 톤·호흡·감정만 흡수하고, 메인 키워드에 자연스럽게 어울리는 새 문장을 만들어라.
※ ${count}개 후보는 서로 다른 패턴 라벨에서 영감받아 톤이 분산되어야 한다.`);

  sections.push(`[과제]
"${mainKeyword}"를 첫 단어로 한 정보성 블로그 제목 ${count}개를 작성하라.

각 후보에 대해 다음 3가지를 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 영감을 받은 톤 견본 라벨 (예: "${formula.patterns[0]?.label ?? ""}")
- emotion: 이 제목이 자극하는 감정 (위 허용 감정 중 하나)`);

  const punctuationAllowed = PUNCTUATION_ALLOWED_STRUCTURES.has(
    formula.structureLabel
  );
  sections.push(
    punctuationAllowed
      ? BRAND_TITLE_BASE_RULES_EXPRESSIVE
      : BRAND_TITLE_BASE_RULES
  );
  sections.push(BRAND_TITLE_ZERO_EXPOSURE_RULES);

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 모든 emotion이 허용 화이트리스트(${formula.emotions.join(", ")}) 안에 있는가?
3. ${punctuationAllowed ? "추상어·회사명이 0건인가? (문장부호는 톤 표현용 허용)" : "문장부호·추상어·회사명이 0건인가?"}
4. ${count}개 후보가 서로 다른 톤 패턴인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 정보성글 폴백 — titleFormula 없을 때 (info-1~5 레거시, user 카드 분석 전 등)
// ─────────────────────────────────────────────

function buildInfoFallbackPrompt(opts: BuildBrandTitlePromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 정보성 블로그의 제목을 짓는 카피라이터입니다.
메인 키워드에 맞춰 익명의 업계 종사자 톤으로 정보성 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[톤 가이드]
- 정보성 블로그의 일반적 톤: 정보 안내·기준 제시·궁금증 자극·후회 환기 중 하나 이상
- 광고 톤·자랑 톤 절대 금지
- 익명 업계 종사자가 쓴 정보 글의 결
- ${count}개가 서로 다른 톤으로 분산되어야 한다 (한 가지 감정에 몰리지 않게)`);

  sections.push(`[과제]
"${mainKeyword}"를 첫 단어로 한 정보성 제목 ${count}개를 작성하라.

각 후보에 대해 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 후보의 톤을 짧게 라벨링 (예: "기준 안내", "후회 환기", "정보 정리")
- emotion: 이 제목이 자극하는 감정 (예: "궁금증", "후회", "신뢰")`);

  sections.push(titleBaseRules(mainKeyword));
  sections.push(BRAND_TITLE_ZERO_EXPOSURE_RULES);

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 문장부호·추상어·회사명이 0건인가?
3. ${count}개 후보가 서로 다른 톤인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 소개글 — 톤 견본(titleFormula) 기반 프롬프트
//
// 정보성글과의 핵심 차이:
// - BRAND_TITLE_ZERO_EXPOSURE_RULES 부착 안 함 → 회사명·대표 노출 OK
//   (예: "대표 이름 걸고 약속드립니다")
// - 화자: 익명 전문가 X → 브랜드 대표·운영자 1인칭 톤
// - 정보성글의 PUNCTUATION_ALLOWED 분기 적용 안 함 (소개글은 차분한 톤이라 BASE_RULES 충분)
// ─────────────────────────────────────────────

function buildFormulaBasedIntroPrompt(
  opts: BuildBrandTitlePromptOptions,
  formula: BrandTitleFormula
): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const patternsBlock = formula.patterns
    .map((p, i) => `${i + 1}. (${p.label}) "${p.tail}"`)
    .join("\n");

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 소개글의 제목을 짓는 카피라이터입니다.
브랜드 대표·운영자 1인칭 톤으로, 아래 톤 견본을 학습한 뒤 메인 키워드에 맞춰 새 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[구조 — ${formula.structureLabel}]
공식 흐름: ${formula.formula}`);

  sections.push(`[허용 감정 — 화이트리스트]
${formula.emotions.join(" · ")}
※ 이 감정 범위 밖의 톤은 절대 사용하지 마라. 다른 감정으로 가면 구조 정체성이 무너진다.`);

  sections.push(`[톤 견본 패턴 — 학습용]
${patternsBlock}

※ 위 견본은 "이 결로 써라"는 가이드일 뿐이다.
※ 견본 문장을 그대로 복사하지 마라. 톤·호흡·감정만 흡수하고, 메인 키워드에 자연스럽게 어울리는 새 문장을 만들어라.
※ ${count}개 후보는 서로 다른 패턴 라벨에서 영감받아 톤이 분산되어야 한다.`);

  sections.push(`[과제]
${taskHeadline(mainKeyword, topic, "브랜드 소개글 제목", count)}

각 후보에 대해 다음 3가지를 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 영감을 받은 톤 견본 라벨 (예: "${formula.patterns[0]?.label ?? ""}")
- emotion: 이 제목이 자극하는 감정 (위 허용 감정 중 하나)`);

  sections.push(`[소개글 노출 정책 — 정보성글과 정반대]
- 회사명·브랜드명·대표 이름·서비스명 등장 OK. 소개글의 본질은 "사람이 등장하는 글".
- "대표 이름 걸고", "저희가", "끝까지 책임지고 싶었습니다" 같은 1인칭 자기 노출 자연스러움.
- 단, 추상어·광고어(최고의·프리미엄·완벽한)는 여전히 금지.`);

  sections.push(titleBaseRules(mainKeyword));

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 모든 emotion이 허용 화이트리스트(${formula.emotions.join(", ")}) 안에 있는가?
3. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
4. ${count}개 후보가 서로 다른 톤 패턴인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 가치입증글 — 톤 견본(titleFormula) 기반 프롬프트
//
// 특수성: 본문 1장(case-proof)에 3개 톤(결과 강조 / 드문 사례 / 희망)을 통합 시드.
// 5개 후보는 3개 톤에서 골고루 큐레이션되도록 명시 지시.
// 소개글과 동일하게 회사명·대표 노출 허용 (ZERO_EXPOSURE 부착 안 함).
// ─────────────────────────────────────────────

function buildFormulaBasedValueProofPrompt(
  opts: BuildBrandTitlePromptOptions,
  formula: BrandTitleFormula
): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const patternsBlock = formula.patterns
    .map((p, i) => `${i + 1}. (${p.label}) "${p.tail}"`)
    .join("\n");

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 가치입증글의 제목을 짓는 카피라이터입니다.
"실제 사례·결과·실력으로 신뢰를 증명한다" 톤으로, 아래 견본을 학습한 뒤 메인 키워드에 맞춰 새 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[구조 — ${formula.structureLabel}]
공식 흐름: ${formula.formula}`);

  sections.push(`[허용 감정 — 화이트리스트]
${formula.emotions.join(" · ")}
※ 이 감정 범위 밖의 톤은 절대 사용하지 마라.`);

  sections.push(`[톤 견본 패턴 — 학습용 (3개 톤으로 구성)]
${patternsBlock}

※ 위 패턴들은 3가지 색깔로 묶여 있다:
  · 결과 강조형 — "달라진 / 결과 차이 / 수치 확인" 결
  · 드문 사례형 — "흔치 않은 / 기억에 남는 / 어려웠던" 결
  · 희망 메시지형 — "가능했습니다 / 충분히 / 가능성" 결

※ 견본 문장을 그대로 복사하지 마라. 톤·호흡·감정만 흡수하고 메인 키워드에 맞게 변형하라.
※ ${count}개 후보는 위 3가지 톤에서 골고루 분포되도록 큐레이션하라 (한 톤에 몰리지 않게).`);

  sections.push(`[과제]
${taskHeadline(mainKeyword, topic, "가치입증 제목", count)}

각 후보에 대해 다음 3가지를 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 영감을 받은 톤 견본 라벨 (예: "${formula.patterns[0]?.label ?? ""}")
- emotion: 이 제목이 자극하는 감정 (위 허용 감정 중 하나)`);

  sections.push(`[가치입증글 톤 정책 — 핵심 원칙]
- ❌ 단순 후기·자랑 X. "결과와 실력으로 신뢰를 증명한다" 느낌이 본질.
- ✅ 결과를 먼저 보여줌 (과정보다 결과에 사람이 먼저 반응)
- ✅ 극단 상황 활용 ("거의 불가능했던", "포기 직전이었던", "정말 어려웠던")
- ✅ "실제 사례" 느낌 — "실제 사례", "직접 경험", "실제 결과" 같은 어휘 자연스럽게
- ✅ 희망 메시지 — "나도 가능할 수 있겠다" 느낌
- 회사명·"저희가" 1인칭 노출 자연스러우면 OK. 강제 X.
- 단, 추상어(최고의·프리미엄·완벽한)는 여전히 금지.`);

  sections.push(titleBaseRules(mainKeyword));

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 모든 emotion이 허용 화이트리스트(${formula.emotions.join(", ")}) 안에 있는가?
3. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
4. ${count}개 후보가 3가지 톤에서 골고루 분포되어 서로 다른 결인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 상세페이지글 — 톤 견본(titleFormula) 기반 프롬프트
//
// 특수성:
// - 본문 1장(trust-period 신뢰기간형)에 4개 톤(문제·기준 / 공감·경고 / 신뢰 / 결과 기대)을 통합 시드.
// - 상세페이지는 클릭(CTR)보다 "전환(구매 욕구 + 신뢰)" 중심.
// - 회사명·대표 노출 OK (소개글·가치입증글과 동일 정책).
// ─────────────────────────────────────────────

function buildFormulaBasedDetailPrompt(
  opts: BuildBrandTitlePromptOptions,
  formula: BrandTitleFormula
): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const patternsBlock = formula.patterns
    .map((p, i) => `${i + 1}. (${p.label}) "${p.tail}"`)
    .join("\n");

  // 톤 구성 분기 — structureLabel별로 톤 개수·색깔·특화 가이드가 달라진다.
  //   · 신뢰기간형: 4톤 (문제·기준 / 공감·경고 / 신뢰 / 결과 기대)
  //   · 전액환불 보증형: 5톤 (리스크 제거 / 자신감 선언 / 손실 회피 / 고객 안심 / 충격 보장)
  //   · 이벤트 유도형: 5톤 (한정·마감 / 혜택 강조 / 손실회피·비용 / 부담제거·상담 / 호기심)
  let toneCount: number;
  let toneGuide: string;
  let extraGuide: string;
  if (formula.structureLabel === "전액환불 보증형") {
    toneCount = 5;
    toneGuide = `  · 리스크 제거 톤 — "환불 / 끝까지 / 책임 / 자신" 결
  · 자신감 선언 톤 — "자신 / 증명 / 확신 / 가능" 결
  · 손실 회피 톤 — "후회 / 불안 / 부담 / 걱정" 결
  · 고객 안심 톤 — "함께 / 도와 / 편하게 / 부담 없이" 결
  · 충격 보장 톤 — "여기까지 / 드물게 / 보통은 / 괜히" 결`;
    extraGuide = `

[전액환불 보증형 특화 가이드]
- ❌ 단순 환불 혜택·이벤트처럼 보이면 안 됨. "환불 이벤트 진행 중", "전액환불 이벤트" 같은 톤 금지.
- ✅ "이 정도로 자신 있다는 거구나" 느낌이 들어야 함.
- ✅ 환불·책임·보장·끝까지 같은 단어를 자신감 위에 얹어라 (자신감 없으면 절대 못 할 행동처럼 보여야 함).`;
  } else if (formula.structureLabel === "이벤트 유도형") {
    toneCount = 5;
    toneGuide = `  · 한정·마감 톤 — "다시 없음 / 한정 / 선착순 / 마감 전" 결
  · 혜택 강조 톤 — "무료 / 추가비용 X / 처음 / 더 많이" 결
  · 손실회피·비용 톤 — "지나가면 / 미루셨다면 / 망설이셨다면 / 아까운" 결
  · 부담제거·상담 톤 — "상담만 / 부담 없이 / 편하게 / 어렵지 않음" 결
  · 호기심 톤 — "이유 / 왜 / 가장 많이 / 더 중요한" 결`;
    extraGuide = `

[이벤트 유도형 특화 가이드]
- ❌ 허세 광고 톤 절대 금지 — "역대급", "대박", "미친 혜택", "무조건", "100%", "절대 후회 없음", "오늘 아니면 끝" 같은 단어 일체 사용 금지.
- ❌ 흔한 광고 톤 금지 — "이벤트 진행 중", "특별 이벤트 안내", "다양한 혜택", "풍성한 이벤트", "할인 이벤트 오픈" 등.
- ✅ "왜 지금 해야 하는지" 이유가 보여야 함 (단순 할인 X).
- ✅ 구체성 — 가능하면 "이번 달 한정", "선착순", "추가 비용 없이", "ㅇㅇ만원 상당" 같이 조건이 구체적일 것.
- ✅ 신뢰 위에 한정 혜택을 얹는 구조 — 단순 싸구려 할인처럼 보이면 안 됨.`;
  } else {
    // 기본 — 신뢰기간형
    toneCount = 4;
    toneGuide = `  · 문제·기준 톤 — "막힘 / 고민 / 어떤 기준" 결
  · 공감·경고 톤 — "같은 고민 / 처음이라 불안 / 손해" 결
  · 신뢰 톤 — "저희가 / 끝까지 / 책임 / 신뢰" 결
  · 결과 기대 톤 — "달라질 / 만족도 / 체감" 결`;
    extraGuide = "";
  }

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 상세페이지 제목을 짓는 카피라이터입니다.
상세페이지는 클릭이 아닌 "전환(구매 욕구 + 신뢰)"이 목적입니다.
아래 견본을 학습한 뒤 메인 키워드에 맞춰 새 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[구조 — ${formula.structureLabel}]
공식 흐름: ${formula.formula}`);

  sections.push(`[허용 감정 — 화이트리스트]
${formula.emotions.join(" · ")}
※ 이 감정 범위 밖의 톤은 절대 사용하지 마라.`);

  sections.push(`[톤 견본 패턴 — 학습용 (${toneCount}개 톤으로 구성)]
${patternsBlock}

※ 위 패턴들은 ${toneCount}가지 색깔로 묶여 있다:
${toneGuide}

※ 견본 문장을 그대로 복사하지 마라. 톤·호흡·감정만 흡수하고 메인 키워드에 맞게 변형하라.
※ ${count}개 후보는 위 ${toneCount}가지 톤에서 골고루 분포되도록 큐레이션하라 (한 톤에 몰리지 않게).`);

  sections.push(`[과제]
${taskHeadline(mainKeyword, topic, "상세페이지 제목", count)}

각 후보에 대해 다음 3가지를 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 영감을 받은 톤 견본 라벨 (예: "${formula.patterns[0]?.label ?? ""}")
- emotion: 이 제목이 자극하는 감정 (위 허용 감정 중 하나)`);

  sections.push(`[상세페이지 톤 정책 — 핵심 원칙]
- ❌ 단순 광고 제목 X. "문제를 해결해줄 수 있을 것 같다" 느낌이 본질.
- ✅ 현실 고민을 직접 건드림 (사람은 문제 해결 가능성이 보일 때 움직임)
- ✅ 과장보다 현실감 — "계속 고민했던", "많이 망설이는", "끝까지 헷갈리는"
- ✅ 신뢰 흐름 — 책임감·설명·소통·기준·과정
- 회사명·"저희가" 1인칭 노출 자연스러우면 OK. 강제 X.
- 단, 추상어(최고의·프리미엄·완벽한·혁신적인)는 여전히 금지.${extraGuide}`);

  sections.push(titleBaseRules(mainKeyword));

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 모든 emotion이 허용 화이트리스트(${formula.emotions.join(", ")}) 안에 있는가?
3. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
4. ${count}개 후보가 ${toneCount}가지 톤에서 골고루 분포되어 서로 다른 결인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 소개글 폴백 — titleFormula 없을 때
// 화자: 브랜드 대표·운영자 1인칭. 회사명·대표 노출 OK (ZERO_EXPOSURE 미부착).
// ─────────────────────────────────────────────

function buildIntroFallbackPrompt(opts: BuildBrandTitlePromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 소개글의 제목을 짓는 카피라이터입니다.
브랜드 대표·운영자 1인칭 톤으로, ${headerLead(mainKeyword)} 소개글 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[톤 가이드]
- 신뢰·공감·진심·안심을 자극하는 결
- 단순 경력 자랑·과시 톤 금지. "사람이 등장하는 글"의 본질을 살릴 것
- 1인칭 자기 노출 자연스러움 — "저희가", "끝까지 책임지고", "약속드립니다", "걸고" 등
- 합니다체와 친근한 구어체를 적절히 섞어 따뜻한 인상
- ${count}개가 서로 다른 톤(신념 / 약속 / 진심 / 안심 / 공감)으로 분산되어야 한다`);

  sections.push(`[과제]
${taskHeadline(mainKeyword, topic, "브랜드 소개글 제목", count)}

각 후보에 대해 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 후보의 톤을 짧게 라벨링 (예: "신념 고백", "대표 약속", "진심 호소")
- emotion: 이 제목이 자극하는 감정 (예: "신뢰", "공감", "안심", "감사", "호감")`);

  sections.push(`[소개글 노출 정책 — 정보성글과 정반대]
- 회사명·브랜드명·대표 이름·서비스명 등장 OK.
- "대표 이름 걸고", "저희가", "끝까지 책임지고 싶었습니다" 같은 1인칭 자기 노출 자연스러움.
- 단, 추상어·광고어(최고의·프리미엄·완벽한)는 여전히 금지.`);

  sections.push(titleBaseRules(mainKeyword));

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
3. ${count}개 후보가 서로 다른 톤인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 가치입증글 폴백 — titleFormula 없을 때
// 화자: 브랜드 대표 1인칭. 결과·수치·실력으로 신뢰 증명 톤. 회사명 노출 OK.
// ─────────────────────────────────────────────

function buildValueProofFallbackPrompt(
  opts: BuildBrandTitlePromptOptions
): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 가치입증글의 제목을 짓는 카피라이터입니다.
"실제 사례·결과·실력으로 신뢰를 증명한다" 톤으로, ${headerLead(mainKeyword)} 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[톤 가이드]
- 결과·구체 사례·수치로 신뢰를 증명하는 결
- 단순 자랑 X. 반전 고백·실패 노출 후 통찰·해결 결로 풀 것
- 극단 상황 활용 OK — "거의 불가능했던", "포기 직전이었던", "정말 어려웠던"
- "실제 사례", "직접 경험", "실제 결과" 같은 어휘 자연스럽게
- 희망 메시지 — "나도 가능할 수 있겠다" 느낌을 자극
- ${count}개가 서로 다른 톤(결과 강조 / 드문 사례 / 희망 메시지)으로 분산되어야 한다`);

  sections.push(`[과제]
${taskHeadline(mainKeyword, topic, "가치입증 제목", count)}

각 후보에 대해 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 후보의 톤을 짧게 라벨링 (예: "수치 입증", "반전 고백", "시장 폭로", "결과 증명")
- emotion: 이 제목이 자극하는 감정 (예: "신뢰", "희망", "공감", "안심")`);

  sections.push(`[가치입증글 노출 정책]
- 회사명·"저희가" 1인칭 노출 자연스러우면 OK. 강제 X.
- 단, 추상어(최고의·프리미엄·완벽한)는 여전히 금지.`);

  sections.push(titleBaseRules(mainKeyword));

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
3. ${count}개 후보가 서로 다른 톤인가?`);

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────
// 상세페이지글 폴백 — titleFormula 없을 때
// 화자: 브랜드 대표 1인칭. 구매 직전 실무 안내 + 세세한 차이 강조 톤. 회사명 노출 OK.
// ─────────────────────────────────────────────

function buildDetailFallbackPrompt(opts: BuildBrandTitlePromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 상세페이지 제목을 짓는 카피라이터입니다.
상세페이지는 클릭이 아닌 "전환(구매 욕구 + 신뢰)"이 목적입니다.
브랜드 대표 1인칭 톤으로, ${headerLead(mainKeyword)} 상세페이지 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword || "없음 — 견본 톤에 맞춰 서로 다른 각도로 자유롭게"}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[톤 가이드]
- 현실 고민을 직접 건드림 ("계속 고민했던", "많이 망설이는", "끝까지 헷갈리는")
- 부드럽고 솔직한 정보 전달 — 가격·일정·진행 방식 같은 실무 정보, 세세한 차이·꼼꼼함 강조
- 신뢰 흐름 — 책임감·설명·소통·기준·과정
- 강매/과장 표현·광고어 절대 금지
- ${count}개가 서로 다른 톤(문제·기준 / 공감·경고 / 신뢰 / 결과 기대)으로 분산되어야 한다`);

  sections.push(`[과제]
${taskHeadline(mainKeyword, topic, "상세페이지 제목", count)}

각 후보에 대해 함께 반환:
${titleFieldDesc(mainKeyword)}
- pattern: 후보의 톤을 짧게 라벨링 (예: "실무 안내", "차이 강조", "꼼꼼한 과정", "결정 도움")
- emotion: 이 제목이 자극하는 감정 (예: "신뢰", "안심", "감사", "결정 확신")`);

  sections.push(`[상세페이지 노출 정책]
- 브랜드명·서비스명·"저희가" 1인칭 노출 자연스러우면 OK. 강제 X.
- 단, 추상어(최고의·프리미엄·완벽한·혁신적인)는 여전히 금지.`);

  sections.push(titleBaseRules(mainKeyword));

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. ${startsWithCheck(mainKeyword)}
2. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
3. ${count}개 후보가 서로 다른 톤인가?`);

  return sections.join("\n\n");
}
