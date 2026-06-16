/**
 * 브랜드 글 품질 수정 프롬프트.
 *
 * - 검증기에서 잡힌 실패 사유를 받아 그 부분만 고치도록 LLM에 지시.
 * - 화자·톤·골격은 절대 바꾸지 말 것.
 */
import type { BrandProfile, BrandProposition, BrandTemplateId } from "@/types/brand";
import { buildBrandContext } from "./brand-context";
import { getBrandContextMode } from "./policy";
import { getTemplateReference, getTemplateLabel } from "./template-loader";
import { buildToneRule } from "./tone-extractor";
import { buildSharedRules } from "./shared";

interface BuildFixPromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: string | null;
  content: string;
  failReasons: string[];
  keyword: string;
  propositions?: BrandProposition[];
}

export function buildBrandFixPrompt(opts: BuildFixPromptOptions): string {
  const { profile, template, infoVariantId, content, failReasons, keyword } = opts;
  const reference = getTemplateReference(template, infoVariantId);

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그 글의 품질을 다듬는 편집자입니다.
아래 글에서 [수정 사유]에 명시된 문제만 정확히 고치세요.`);

  sections.push(`[브랜드: ${profile.name} / 템플릿: ${getTemplateLabel(template)} / 메인 키워드: ${keyword}]`);

  // 품질 보정 재생성도 글 종류별 필터를 따라야 중복 비화가 되살아나지 않음.
  sections.push(buildBrandContext(profile, getBrandContextMode(template)));

  if (reference) {
    sections.push(buildToneRule(reference));
  }

  sections.push(`[원본 글]\n${content}`);

  sections.push(`[수정 사유 — 이것만 정확히 해결하세요]\n${failReasons.map((r) => `- ${r}`).join("\n")}`);

  sections.push(`[수정 시 절대 지킬 것]
- 화자(${profile.narrator?.name || ""} 1인칭)는 바꾸지 마세요
- 글의 골격은 유지하세요 — 새 글을 쓰는 것이 아니라 다듬는 작업
- 톤·말투는 그대로 유지
- 마크다운 구조 그대로`);

  sections.push(buildSharedRules());

  sections.push(`[출력 형식]
수정된 마크다운 본문만 출력. 설명·코드 블록 마커 X.`);

  return sections.join("\n\n");
}
