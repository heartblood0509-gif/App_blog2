/**
 * 가치입증글 변형 — 서사 구조 기반 작성.
 *
 * 입력: 보관함에서 선택된 분석 레코드 (analysis 마크다운).
 *
 * 정보성글 info-structure-based와의 차이점:
 * - 정보성글: 익명 전문가 톤 + 브랜드 노출 95% 지점까지 차단
 * - 가치입증글: 1인칭 대표 본인 톤 + 자사 노출·권위 입증 유지
 *
 * intro-structure-based와 같은 1인칭 톤 정책이지만, 가치입증글은 "권위·수치·결과"에 무게.
 *
 * 기존 buildValueProofPrompt와의 차이:
 * - VALUE_PROOF_REFERENCE 미사용 (분석본 자체에 톤 정보 포함)
 * - VALUE_PROOF_SKELETON → analysisRecord.analysis로 교체
 */
import type { BrandProfile, AnalysisRecord } from "@/types/brand";
import { buildBrandContext, buildBrandDataMap } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildValueProofStructureBasedPromptOptions {
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

export function buildValueProofStructureBasedPrompt(
  opts: BuildValueProofStructureBasedPromptOptions
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

  // ★ 가치입증글은 자사 노출 유지 (1인칭 대표 본인 톤, 권위·수치 강조)
  sections.push(buildBrandContext(profile, "value-proof"));
  sections.push(buildNarratorRule(profile, "value-proof"));

  // 분석본 (서사 구조·소제목·톤 가이드)
  sections.push(analysisRecord.analysis);

  // 핵심 지시 — 가치입증글 본질 (1인칭 대표 톤 + 권위 입증)
  sections.push(`[핵심 지시 — 가치입증글 서사 구조 기반 모드]
- 위 분석본의 서사 흐름·소제목 패턴·문체 가이드를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 메인 키워드 도메인에 맞춰 처음부터 새로 창작한다.
- 분석본에 견본의 다른 산업·지역·인물명이 잠복해 있어도 본문에 그대로 사용하지 않는다.

[가치입증글 본질 — 1인칭 대표 + 권위 입증 (절대 위반 금지)]
- 가치입증글은 "대표가 직접 자사의 가치·권위·결과를 입증하는 글"이다. 정보성글과 정반대로 자사 노출이 본질이다.
- 화자는 브랜드 컨텍스트의 ${`<narrator>`} (대표 본인) — 이름·직책·경력·수치를 자연스럽게 노출한다.
- 브랜드명·자사 서비스·시그니처 표현은 본문 전반에 자연스럽게 녹여낸다 (정보성글의 95% 지점 차단 정책 미적용).
- 권위는 수치·구체 사례·결과 데이터로 입증한다. 추상 자랑 X.
- 광고 직접 표현("꼭 결제하세요" 등)은 금지. 부드러운 CTA + "감사·희망" 톤으로 닫는다.`);

  // 데이터 활용 지도 — 분석본·핵심 지시 뒤 마지막에 배치 (탄생스토리 10% 캡이 최종 지시로 우선).
  sections.push(buildBrandDataMap("value-proof"));

  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
