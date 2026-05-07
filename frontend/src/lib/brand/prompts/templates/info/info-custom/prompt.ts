/**
 * 정보성글 변형 — 직접 레퍼런스 제공 모드.
 *
 * 사용자가 입력한 견본 글(referenceText)과 그 분석 결과(referenceAnalysis)를
 * 그대로 학습시켜, 같은 톤·서사 구조·소제목 패턴으로 새 글을 작성한다.
 *
 * 정보성글 정책 (info 전체 공통):
 *   - 본문/제목에 회사명·인물명·시그니처 노출 0
 *   - 브랜드 프로필 직접 주입 X. distill propositions를 보조 정보로 사용
 *   - 화자는 익명 업계 전문가 (견본 글에 화자가 명시돼 있어도 우리 브랜드로 치환 X)
 *
 * info-custom 특이사항:
 *   - 견본 글이 본문 톤·서사의 1순위. propositions는 "참고 정보"로 라벨링하여 톤 충돌 방지.
 *   - 골격(SKELETON) 미강제 — 견본 구조 자체가 골격.
 */
import type { BrandProfile, BrandProposition } from "@/types/brand";
import { buildAnonymousExpertNarrator } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import {
  buildSharedRulesForInfo,
  buildTopicSection,
  buildPropositionsBlock,
} from "../../../shared";

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
  /** distill API에서 추출한 정보 명제. 정보성글에서는 필수 */
  propositions?: BrandProposition[];
}

export function buildInfoCustomPrompt(opts: BuildInfoCustomPromptOptions): string {
  const {
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    charCount,
    requirements,
    referenceText,
    referenceAnalysis,
    propositions,
  } = opts;

  if (!propositions || propositions.length === 0) {
    throw new Error(
      "정보성글 본문 생성에는 propositions가 필요합니다. distill API를 먼저 호출하세요."
    );
  }

  const sections: string[] = [];

  sections.push(`당신은 한국어 [정보성글]을 쓰는 전문 에디터입니다.
이 글은 일반 정보 제공이 목적이며, 특정 회사·인물을 알리는 글이 절대 아닙니다.
아래 모든 정보를 종합해서 마크다운 본문 한 편을 작성하세요.`);

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

  // 정보 명제 — 보조 재료 (견본 톤이 우선)
  sections.push(buildPropositionsBlock(propositions));

  // 화자는 익명 전문가
  sections.push(buildAnonymousExpertNarrator());

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

  // 핵심 지시 — propositions와 견본 글의 우선순위 명시
  sections.push(`[핵심 지시 — 직접 레퍼런스 모드 (정보성글)]
- 견본 글의 서사 구조·톤·소제목 패턴·문단 호흡을 그대로 따른다.
- 주제·키워드·소재만 새로 입력된 메인 키워드와 주제로 교체한다.
- 견본 글에 등장한 회사명·지역·인물·산업 어휘는 새 도메인의 것으로 모두 교체한다.
- [정보 재료] 명제는 본문 흐름에 맞을 때만 보조적으로 활용한다 (모두 다 박지 마라).
- 견본 글에 없는 광고 문구·억지 자랑·자사 노출 금지.`);

  // 정보성글 전용 공통 규칙
  sections.push(buildSharedRulesForInfo());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
