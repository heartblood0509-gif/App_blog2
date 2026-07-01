/**
 * 소개글 변형 — 서사 구조 기반 작성.
 *
 * 입력: 보관함에서 선택된 분석 레코드 (analysis 마크다운).
 *
 * 정보성글 info-structure-based와의 차이점:
 * - 정보성글: 익명 전문가 톤 + 브랜드 노출 95% 지점까지 차단 (buildAnonymousBrandContext)
 * - 소개글:   1인칭 대표 본인 톤 + 자사 노출 유지 (buildBrandContext + buildNarratorRule("intro"))
 *
 * 빌더 호출 순서는 기존 buildIntroPrompt와 100% 동일.
 * INTRO_SKELETON (코드 하드코딩) → analysisRecord.analysis (보관함) 이 한 곳만 교체.
 * 이를 통해 LLM에 전달되는 prompt 텍스트가 마이그레이션 전후 글자 단위로 동일하도록 보장.
 */
import type { BrandProfile, AnalysisRecord } from "@/types/brand";
import { buildBrandContext, buildBrandDataMap } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";
import { INTRO_REFERENCE } from "../reference";

interface BuildIntroStructureBasedPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** 보관함에서 선택된 분석 레코드 (필수) */
  analysisRecord: AnalysisRecord;
}

export function buildIntroStructureBasedPrompt(
  opts: BuildIntroStructureBasedPromptOptions
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
아래 모든 정보를 종합해서 [소개글] 한 편을 마크다운으로 작성하세요.`);

  // 글자수 강제는 LLM 퀄리티 저하의 주범 — 사용자가 명시 선택한 경우(min/max 양쪽 > 0)에만 박음
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

  sections.push(buildBrandContext(profile, "intro"));
  sections.push(buildNarratorRule(profile, "intro"));

  // 레퍼런스 견본 글이 있을 때만 톤 학습 + 레퍼런스 섹션 주입 (기존 buildIntroPrompt와 동일 처리)
  if (INTRO_REFERENCE && INTRO_REFERENCE.trim().length > 0) {
    sections.push(buildToneRule(INTRO_REFERENCE));
    sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INTRO_REFERENCE}`);
  }

  // 기존 buildIntroPrompt의 INTRO_SKELETON 위치 — analysisRecord.analysis로 교체.
  // 보관함 카드의 analysis 필드에는 기존 INTRO_SKELETON 텍스트가 그대로 복사되어 있으므로
  // 결과적으로 LLM에 전달되는 prompt 텍스트는 마이그레이션 전과 100% 동일하다.
  sections.push(analysisRecord.analysis);

  // 데이터 활용 지도 — 분석본 뒤에 배치해 최종 지시로 우선되게.
  sections.push(buildBrandDataMap("intro"));

  sections.push(buildSharedRules({ hasKeyword: Boolean(mainKeyword?.trim()) }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
