/**
 * 소개글 변형 — 직접 레퍼런스 제공 모드.
 *
 * 사용자가 입력한 견본 소개글(referenceText)과 그 분석 결과(referenceAnalysis)를
 * 그대로 학습시켜, 같은 톤·서사 구조·소제목 패턴으로 새 소개글을 작성한다.
 *
 * 정보성글 info-custom과의 차이점 (★ 가장 중요):
 * - 정보성글: 익명 전문가 톤 + 브랜드 노출 차단 (buildAnonymousBrandContext)
 * - 소개글:   1인칭 대표 본인 톤 + 자사 노출 유지 (buildBrandContext + buildNarratorRule("intro"))
 *
 * 견본 글 자체 파일 없음 — 런타임에 사용자 입력 동적 주입.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildExcerptPatternRule } from "../../../excerpt-pattern";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildIntroCustomPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** 사용자가 제공한 견본 소개글 본문 — 톤 통계 추출 입력으로만 사용. LLM에 주입하지 않음. */
  referenceText?: string;
  /** 견본 글에 대한 AI 구조 분석 결과 (서사·톤·소제목·SEO) — LLM에 주입 */
  referenceAnalysis?: string;
  /** 분석에서 추출된 본보기 문장 — 통계 패턴으로만 변환되어 LLM에 주입 */
  referenceExcerpts?: string[];
}

export function buildIntroCustomPrompt(opts: BuildIntroCustomPromptOptions): string {
  const {
    profile,
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    charCount,
    requirements,
    referenceText,
    referenceAnalysis,
    referenceExcerpts,
  } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [소개글] 한 편을 마크다운으로 작성하세요.`);

  const charCountLine =
    charCount.min > 0 && charCount.max > 0
      ? `\n[목표 글자수] ${charCount.min}~${charCount.max}자`
      : "";
  sections.push(`[글 제목] ${selectedTitle}
[메인 키워드] ${mainKeyword}${subKeywords ? `\n[보조 키워드] ${subKeywords}` : ""}${charCountLine}`);

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  if (requirements && requirements.trim()) {
    sections.push(`[추가 요구사항]\n${requirements.trim()}`);
  }

  // ★ 소개글은 자사 노출 유지 (1인칭 대표 본인 톤)
  sections.push(buildBrandContext(profile));
  sections.push(buildNarratorRule(profile, "intro"));

  // 톤 학습 — 사용자 견본 글의 통계만 추출 (원본 본문은 LLM에 미주입)
  if (referenceText && referenceText.trim().length > 0) {
    sections.push(buildToneRule(referenceText));
  }

  // 어미·호흡 패턴 통계
  if (referenceExcerpts && referenceExcerpts.length > 0) {
    const excerptRule = buildExcerptPatternRule(referenceExcerpts);
    if (excerptRule) sections.push(excerptRule);
  }

  // 견본 분석 결과
  if (referenceAnalysis && referenceAnalysis.trim().length > 0) {
    sections.push(`[견본 글 구조 분석 — AI가 추출한 패턴 정리. 새 글은 이 구조·흐름·소제목 패턴을 따를 것]
${referenceAnalysis.trim()}`);
  }

  // 핵심 지시 — 소개글 본질 (1인칭 대표 톤 유지)
  sections.push(`[핵심 지시 — 소개글 직접 레퍼런스 모드]
- 위 구조 분석의 서사 흐름·소제목 패턴·문단 호흡 분포를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 처음부터 새로 창작한다.
- 견본의 산업·지역·인물명이 분석 안에 잠복해 있으면 절대 본문에 그대로 사용하지 않는다.

[소개글 본질 — 1인칭 대표 본인 톤 (절대 위반 금지)]
- 소개글은 "대표 또는 운영자가 자신을 직접 소개하는 글"이다. 정보성글과 정반대로 자사 노출이 본질이다.
- 화자는 브랜드 컨텍스트의 ${`<narrator>`} (대표 본인) — 이름·직책·경력을 자연스럽게 노출한다.
- 브랜드명·자사 서비스·시그니처 표현은 본문 전반에 자연스럽게 녹여낸다 (정보성글의 95% 지점 차단 정책 미적용).
- 단, 광고 직접 표현("꼭 결제하세요" 등)은 금지. "감사"·"신뢰" 톤으로 닫는다.
- 견본 글에 "익명 전문가" 톤이 있더라도 새 글에서는 대표 본인 1인칭 ("저는...", "저희가...")으로 작성한다.`);

  sections.push(buildSharedRules({ mode: "follow-reference" }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
