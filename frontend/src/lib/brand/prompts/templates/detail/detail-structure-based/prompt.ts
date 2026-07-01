/**
 * 상세페이지글 변형 — 서사 구조 기반 작성.
 *
 * 톤 정책: 1인칭 대표 본인 + 자사 노출 유지 (구매 직전 단계, 신뢰·기준 제시 중심).
 * 가치입증글과 비슷하지만 구매 결정에 더 가까운 부드러운 안내·기준 제시 톤.
 */
import type { BrandProfile, AnalysisRecord } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildDetailStructureBasedPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  analysisRecord: AnalysisRecord;
}

export function buildDetailStructureBasedPrompt(
  opts: BuildDetailStructureBasedPromptOptions
): string {
  const {
    profile,
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    charCount,
    requirements,
    analysisRecord,
  } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [상세페이지글] 한 편을 마크다운으로 작성하세요.`);

  const charCountLine =
    charCount.min > 0 && charCount.max > 0
      ? `\n[목표 글자수] ${charCount.min}~${charCount.max}자`
      : "";
  sections.push(`[글 제목] ${selectedTitle}
[메인 키워드] ${mainKeyword || "없음 (아래 주제 중심으로 작성)"}${subKeywords ? `\n[보조 키워드] ${subKeywords}` : ""}${charCountLine}`);

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  if (requirements && requirements.trim()) {
    sections.push(`[추가 요구사항]\n${requirements.trim()}`);
  }

  // 상세페이지글은 자사 노출 유지 (1인칭 대표 본인 톤, 구매 직전 안내)
  sections.push(buildBrandContext(profile));
  sections.push(buildNarratorRule(profile, "detail"));

  // 분석본
  sections.push(analysisRecord.analysis);

  sections.push(`[핵심 지시 — 상세페이지글 서사 구조 기반 모드]
- 위 분석본의 서사 흐름·소제목 패턴·문체 가이드를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 메인 키워드 도메인에 맞춰 처음부터 새로 창작한다.

[상세페이지글 본질 — 1인칭 대표 + 구매 직전 안내 (절대 위반 금지)]
- 상세페이지글은 "구매를 고민하는 독자에게 마지막 결정 정보를 제공하는 글"이다.
- 화자는 브랜드 컨텍스트의 ${`<narrator>`} (대표 본인). 이름·직책·경력을 자연스럽게 노출.
- 브랜드명·자사 서비스·시그니처 표현은 본문 전반에 자연스럽게 녹여낸다 (정보성글의 95% 차단 정책 미적용).
- 가격·일정·진행 방식 같은 실무 정보를 솔직하게 안내.
- 강매·과장 표현 금지. 부드러운 CTA + "감사" 톤으로 닫음.
- 마지막 단락에서 자연스러운 문의 유도 (단, "지금 결제하세요" 류 직접 표현 X).`);

  sections.push(buildSharedRules({ hasKeyword: Boolean(mainKeyword?.trim()) }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
