/**
 * 상세페이지글 변형 — 직접 레퍼런스 제공 모드.
 *
 * 톤 정책: 1인칭 대표 본인 + 자사 노출 유지 + 구매 직전 안내.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildExcerptPatternRule } from "../../../excerpt-pattern";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildDetailCustomPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  referenceText?: string;
  referenceAnalysis?: string;
  referenceExcerpts?: string[];
}

export function buildDetailCustomPrompt(opts: BuildDetailCustomPromptOptions): string {
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
아래 모든 정보를 종합해서 [상세페이지글] 한 편을 마크다운으로 작성하세요.`);

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
  sections.push(buildNarratorRule(profile, "detail"));

  if (referenceText && referenceText.trim().length > 0) {
    sections.push(buildToneRule(referenceText));
  }

  if (referenceExcerpts && referenceExcerpts.length > 0) {
    const excerptRule = buildExcerptPatternRule(referenceExcerpts);
    if (excerptRule) sections.push(excerptRule);
  }

  if (referenceAnalysis && referenceAnalysis.trim().length > 0) {
    sections.push(`[견본 글 구조 분석 — AI가 추출한 패턴 정리. 새 글은 이 구조·흐름·소제목 패턴을 따를 것]
${referenceAnalysis.trim()}`);
  }

  sections.push(`[핵심 지시 — 상세페이지글 직접 레퍼런스 모드]
- 위 구조 분석의 서사 흐름·소제목 패턴·문단 호흡 분포를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 메인 키워드 도메인에 맞춰 처음부터 새로 창작한다.

[상세페이지글 본질 — 1인칭 대표 + 구매 직전 안내]
- 화자는 브랜드 컨텍스트의 ${`<narrator>`} (대표 본인).
- 브랜드명·자사 서비스를 본문 전반에 자연스럽게 노출 (정보성글 차단 정책 미적용).
- 가격·일정·진행 방식 같은 실무 정보 솔직하게 안내.
- 강매·과장 표현 금지. 부드러운 CTA + "감사" 톤으로 닫음.`);

  sections.push(buildSharedRules({ mode: "follow-reference" }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
