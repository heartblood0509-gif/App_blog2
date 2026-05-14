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
  BRAND_TITLE_ZERO_EXPOSURE_RULES,
} from "./shared";

/**
 * 문장부호 허용 구조 화이트리스트 — 강한 폭로톤 구조만 여기에 추가.
 * 라벨 매칭이므로 시드 라벨과 정확히 일치해야 함.
 */
const PUNCTUATION_ALLOWED_STRUCTURES = new Set<string>([
  "업계 내부고발형",
]);

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
    // 소개글은 폴백 없음 — titleFormula 없는 카드는 직접 입력 안내
    return null;
  }

  if (opts.template === "value-proof") {
    const formula = opts.analysisRecord?.titleFormula;
    if (formula) {
      return buildFormulaBasedValueProofPrompt(opts, formula);
    }
    return null;
  }

  if (opts.template === "detail") {
    const formula = opts.analysisRecord?.titleFormula;
    if (formula) {
      return buildFormulaBasedDetailPrompt(opts, formula);
    }
    return null;
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
메인 키워드: ${mainKeyword}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

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
- title: 메인 키워드로 시작하는 제목 문장
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
1. 모든 title이 "${mainKeyword}"로 시작하는가?
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
메인 키워드: ${mainKeyword}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[톤 가이드]
- 정보성 블로그의 일반적 톤: 정보 안내·기준 제시·궁금증 자극·후회 환기 중 하나 이상
- 광고 톤·자랑 톤 절대 금지
- 익명 업계 종사자가 쓴 정보 글의 결
- ${count}개가 서로 다른 톤으로 분산되어야 한다 (한 가지 감정에 몰리지 않게)`);

  sections.push(`[과제]
"${mainKeyword}"를 첫 단어로 한 정보성 제목 ${count}개를 작성하라.

각 후보에 대해 함께 반환:
- title: 메인 키워드로 시작하는 제목 문장
- pattern: 후보의 톤을 짧게 라벨링 (예: "기준 안내", "후회 환기", "정보 정리")
- emotion: 이 제목이 자극하는 감정 (예: "궁금증", "후회", "신뢰")`);

  sections.push(BRAND_TITLE_BASE_RULES);
  sections.push(BRAND_TITLE_ZERO_EXPOSURE_RULES);

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. 모든 title이 "${mainKeyword}"로 시작하는가?
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
메인 키워드: ${mainKeyword}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

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
"${mainKeyword}"를 첫 단어로 한 브랜드 소개글 제목 ${count}개를 작성하라.

각 후보에 대해 다음 3가지를 함께 반환:
- title: 메인 키워드로 시작하는 제목 문장
- pattern: 영감을 받은 톤 견본 라벨 (예: "${formula.patterns[0]?.label ?? ""}")
- emotion: 이 제목이 자극하는 감정 (위 허용 감정 중 하나)`);

  sections.push(`[소개글 노출 정책 — 정보성글과 정반대]
- 회사명·브랜드명·대표 이름·서비스명 등장 OK. 소개글의 본질은 "사람이 등장하는 글".
- "대표 이름 걸고", "저희가", "끝까지 책임지고 싶었습니다" 같은 1인칭 자기 노출 자연스러움.
- 단, 추상어·광고어(최고의·프리미엄·완벽한)는 여전히 금지.`);

  sections.push(BRAND_TITLE_BASE_RULES);

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. 모든 title이 "${mainKeyword}"로 시작하는가?
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
메인 키워드: ${mainKeyword}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

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
"${mainKeyword}"를 첫 단어로 한 가치입증 제목 ${count}개를 작성하라.

각 후보에 대해 다음 3가지를 함께 반환:
- title: 메인 키워드로 시작하는 제목 문장
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

  sections.push(BRAND_TITLE_BASE_RULES);

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. 모든 title이 "${mainKeyword}"로 시작하는가?
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

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 상세페이지 제목을 짓는 카피라이터입니다.
상세페이지는 클릭이 아닌 "전환(구매 욕구 + 신뢰)"이 목적입니다.
아래 견본을 학습한 뒤 메인 키워드에 맞춰 새 제목 ${count}개를 작성하세요.`);

  sections.push(`[글 도메인]
카테고리: ${profile.category}
메인 키워드: ${mainKeyword}${subKeywords ? `\n보조 키워드: ${subKeywords}` : ""}${topic ? `\n주제: ${topic}` : ""}`);

  sections.push(`[구조 — ${formula.structureLabel}]
공식 흐름: ${formula.formula}`);

  sections.push(`[허용 감정 — 화이트리스트]
${formula.emotions.join(" · ")}
※ 이 감정 범위 밖의 톤은 절대 사용하지 마라.`);

  sections.push(`[톤 견본 패턴 — 학습용 (4개 톤으로 구성)]
${patternsBlock}

※ 위 패턴들은 4가지 색깔로 묶여 있다:
  · 문제·기준 톤 — "막힘 / 고민 / 어떤 기준" 결
  · 공감·경고 톤 — "같은 고민 / 처음이라 불안 / 손해" 결
  · 신뢰 톤 — "저희가 / 끝까지 / 책임 / 신뢰" 결
  · 결과 기대 톤 — "달라질 / 만족도 / 체감" 결

※ 견본 문장을 그대로 복사하지 마라. 톤·호흡·감정만 흡수하고 메인 키워드에 맞게 변형하라.
※ ${count}개 후보는 위 4가지 톤에서 골고루 분포되도록 큐레이션하라 (한 톤에 몰리지 않게).`);

  sections.push(`[과제]
"${mainKeyword}"를 첫 단어로 한 상세페이지 제목 ${count}개를 작성하라.

각 후보에 대해 다음 3가지를 함께 반환:
- title: 메인 키워드로 시작하는 제목 문장
- pattern: 영감을 받은 톤 견본 라벨 (예: "${formula.patterns[0]?.label ?? ""}")
- emotion: 이 제목이 자극하는 감정 (위 허용 감정 중 하나)`);

  sections.push(`[상세페이지 톤 정책 — 핵심 원칙]
- ❌ 단순 광고 제목 X. "문제를 해결해줄 수 있을 것 같다" 느낌이 본질.
- ✅ 현실 고민을 직접 건드림 (사람은 문제 해결 가능성이 보일 때 움직임)
- ✅ 과장보다 현실감 — "계속 고민했던", "많이 망설이는", "끝까지 헷갈리는"
- ✅ 신뢰 흐름 — 책임감·설명·소통·기준·과정
- 회사명·"저희가" 1인칭 노출 자연스러우면 OK. 강제 X.
- 단, 추상어(최고의·프리미엄·완벽한·혁신적인)는 여전히 금지.`);

  sections.push(BRAND_TITLE_BASE_RULES);

  sections.push(`[응답 형식 — 엄격]
JSON 배열 하나만 출력. 마크다운 코드블록·설명·서두·후미 일체 금지.

[
  {"title": "...", "pattern": "...", "emotion": "..."},
  {"title": "...", "pattern": "...", "emotion": "..."}
]

검산:
1. 모든 title이 "${mainKeyword}"로 시작하는가?
2. 모든 emotion이 허용 화이트리스트(${formula.emotions.join(", ")}) 안에 있는가?
3. 문장부호·추상어가 0건인가? (회사명·대표 노출은 OK)
4. ${count}개 후보가 4가지 톤에서 골고루 분포되어 서로 다른 결인가?`);

  return sections.join("\n\n");
}
