/**
 * 브랜드 글 품질 수정 프롬프트.
 *
 * - 검증기에서 잡힌 실패 사유를 받아 그 부분만 고치도록 LLM에 지시.
 * - 화자·톤·골격은 절대 바꾸지 말 것.
 *
 * 정보성글(template === "info") 분기:
 *   - buildBrandContext 미주입
 *   - 익명 전문가 화자 규칙 사용
 *   - propositions 주입
 *   - BRAND_ZERO_EXPOSURE_RULES 강제
 */
import type {
  BrandProfile,
  BrandTemplateId,
  BrandProposition,
} from "@/types/brand";
import { buildBrandContext } from "./brand-context";
import { getTemplateReference, getTemplateLabel } from "./template-loader";
import { buildToneRule } from "./tone-extractor";
import { buildAnonymousExpertNarrator } from "./narrator";
import {
  buildSharedRules,
  buildSharedRulesForInfo,
  buildPropositionsBlock,
} from "./shared";

interface BuildFixPromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: string | null;
  content: string;
  failReasons: string[];
  keyword: string;
  /** 정보성글 전용 — distill 결과 (수정 시에도 명제 유지) */
  propositions?: BrandProposition[];
}

export function buildBrandFixPrompt(opts: BuildFixPromptOptions): string {
  const {
    profile,
    template,
    infoVariantId,
    content,
    failReasons,
    keyword,
    propositions,
  } = opts;
  const reference = getTemplateReference(template, infoVariantId);
  const isInfo = template === "info";

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그 글의 품질을 다듬는 편집자입니다.
아래 글에서 [수정 사유]에 명시된 문제만 정확히 고치세요.`);

  sections.push(
    `[브랜드 라벨: ${profile.label} / 템플릿: ${getTemplateLabel(template)} / 메인 키워드: ${keyword}]`
  );

  // 정보성글: 브랜드 컨텍스트 미주입, 명제·익명 화자 규칙
  // 그 외: 기존대로 브랜드 컨텍스트 주입
  if (isInfo) {
    if (propositions && propositions.length > 0) {
      sections.push(buildPropositionsBlock(propositions));
    }
    sections.push(buildAnonymousExpertNarrator());
  } else {
    sections.push(buildBrandContext(profile));
  }

  if (reference) {
    sections.push(buildToneRule(reference));
  }

  sections.push(`[원본 글]\n${content}`);

  sections.push(
    `[수정 사유 — 이것만 정확히 해결하세요]\n${failReasons.map((r) => `- ${r}`).join("\n")}`
  );

  if (isInfo) {
    sections.push(`[수정 시 절대 지킬 것 — 정보성글]
- 글의 골격·문단 흐름은 유지하세요 — 새 글을 쓰는 것이 아니라 다듬는 작업
- 화자는 익명 전문가 톤 유지 (회사명·인물명 노출 0)
- 톤·말투는 그대로 유지
- 마크다운 구조 그대로
- 브랜드 노출 검출 사유가 있으면 해당 표현을 일반화·익명화로 치환 (예: 회사명 → "업계", 대표 이름 → "현장에 있어보면")`);
  } else {
    sections.push(`[수정 시 절대 지킬 것]
- 화자(${profile.narrator?.name || ""} 1인칭)는 바꾸지 마세요
- 글의 골격은 유지하세요 — 새 글을 쓰는 것이 아니라 다듬는 작업
- 톤·말투는 그대로 유지
- 마크다운 구조 그대로`);
  }

  // 공통 규칙 분기
  sections.push(isInfo ? buildSharedRulesForInfo() : buildSharedRules());

  sections.push(`[출력 형식]
수정된 마크다운 본문만 출력. 설명·코드 블록 마커 X.`);

  return sections.join("\n\n");
}
