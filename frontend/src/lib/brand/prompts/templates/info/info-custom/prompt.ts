/**
 * 정보성글 변형 — 직접 레퍼런스 제공 모드.
 *
 * 사용자가 입력한 견본 글(referenceText)과 그 분석 결과(referenceAnalysis)를
 * 그대로 학습시켜, 같은 톤·서사 구조·소제목 패턴으로 새 글을 작성한다.
 *
 * - 레퍼런스 글 자체 파일 없음 (런타임에 사용자 입력 동적 주입).
 * - 톤 추출도 사용자 입력 글 기준 (tone-extractor 재활용).
 * - 골격(SKELETON)도 강제 X — 견본 구조 자체가 골격이 됨.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildInfoCustomPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** 사용자가 제공한 견본 글 본문 (URL 크롤링 결과 또는 직접 붙여넣기) */
  referenceText?: string;
  /** 견본 글에 대한 AI 구조 분석 결과 (서사·톤·소제목·SEO) */
  referenceAnalysis?: string;
}

export function buildInfoCustomPrompt(opts: BuildInfoCustomPromptOptions): string {
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
  } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [정보성글] 한 편을 마크다운으로 작성하세요.`);

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

  sections.push(buildBrandContext(profile));
  sections.push(buildNarratorRule(profile, "info"));

  // 톤 학습 — 사용자 견본 글 기준
  if (referenceText && referenceText.trim().length > 0) {
    sections.push(buildToneRule(referenceText));
  }

  // 견본 글 자체 — AI가 구조·흐름·어휘를 학습
  if (referenceText && referenceText.trim().length > 0) {
    sections.push(`[참고 견본 글 — 이 글의 톤·서사 구조·소제목 패턴·문단 흐름을 학습할 것. 본문 자체는 그대로 베끼지 말 것]
${referenceText.trim()}`);
  }

  // 견본 분석 결과 — 추출된 패턴 명시
  if (referenceAnalysis && referenceAnalysis.trim().length > 0) {
    sections.push(`[견본 글 구조 분석 — AI가 추출한 패턴 정리. 새 글도 이 패턴을 따를 것]
${referenceAnalysis.trim()}`);
  }

  // 핵심 지시
  sections.push(`[핵심 지시 — 직접 레퍼런스 모드]
- 위 견본 글의 서사 구조·톤·소제목 패턴·문단 호흡을 그대로 따른다.
- 단, 주제·키워드·소재만 새로 입력된 메인 키워드와 주제로 교체한다.
- 견본 글이 다른 산업/도메인이더라도 톤과 흐름을 차용하되, 브랜드 컨텍스트(우리 화자·금기어·자산)는 반드시 준수한다.
- 견본 글에 없는 광고 문구·억지 자랑 금지.`);

  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
