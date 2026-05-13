/**
 * 가치입증글 변형 — 직접 레퍼런스 제공 모드.
 *
 * 사용자가 입력한 견본 가치입증글(referenceText)과 그 분석 결과(referenceAnalysis)를
 * 그대로 학습시켜, 같은 톤·서사 구조로 새 글을 작성한다.
 *
 * 톤 정책 (intro-custom과 동일, info-custom과 반대):
 * - 1인칭 대표 본인 + 자사 노출 유지
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildExcerptPatternRule } from "../../../excerpt-pattern";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildValueProofCustomPromptOptions {
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

export function buildValueProofCustomPrompt(
  opts: BuildValueProofCustomPromptOptions
): string {
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
아래 모든 정보를 종합해서 [가치입증글] 한 편을 마크다운으로 작성하세요.`);

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

  // 1인칭 대표 톤 유지
  sections.push(buildBrandContext(profile));
  sections.push(buildNarratorRule(profile, "value-proof"));

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

  sections.push(`[핵심 지시 — 가치입증글 직접 레퍼런스 모드]
- 위 구조 분석의 서사 흐름·소제목 패턴·문단 호흡 분포를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 메인 키워드 도메인에 맞춰 처음부터 새로 창작한다.

[가치입증글 본질 — 1인칭 대표 + 권위 입증]
- 화자는 브랜드 컨텍스트의 ${`<narrator>`} (대표 본인). 이름·직책·경력·수치를 자연스럽게 노출.
- 브랜드명·자사 서비스를 본문 전반에 자연스럽게 녹임 (정보성글의 95% 차단 정책 미적용).
- 권위는 수치·구체 사례·결과 데이터로 입증. 추상 자랑 X.
- 광고 직접 표현 금지 — "감사·희망" 톤으로 닫음.`);

  sections.push(buildSharedRules({ mode: "follow-reference" }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
