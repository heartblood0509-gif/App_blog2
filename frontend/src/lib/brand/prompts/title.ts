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
 * 메인 진입점. 정보성글만 프롬프트 반환, 다른 템플릿은 null.
 *
 * @returns Gemini에 보낼 프롬프트 문자열, 또는 null(이 템플릿은 아직 미지원)
 */
export function buildBrandTitlePrompt(
  opts: BuildBrandTitlePromptOptions
): string | null {
  // 1차 작업 범위: 정보성글만. 나머지 템플릿은 사용자가 공식 줄 때까지 빈 결과.
  if (opts.template !== "info") return null;

  const formula = opts.analysisRecord?.titleFormula;
  if (formula) {
    return buildFormulaBasedInfoPrompt(opts, formula);
  }
  return buildInfoFallbackPrompt(opts);
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
