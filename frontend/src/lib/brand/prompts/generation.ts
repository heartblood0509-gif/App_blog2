/**
 * 브랜드 글 생성 — 템플릿별 dispatch 진입점.
 */
import type { BrandProfile, BrandTemplateId, BrandInfoVariantId } from "@/types/brand";
import { buildIntroPrompt } from "./templates/intro/prompt";
import { buildInfo1Prompt } from "./templates/info/info-1/prompt";
import { buildValueProofPrompt } from "./templates/value-proof/prompt";

export interface BuildBrandPromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: BrandInfoVariantId | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

export function buildBrandGenerationPrompt(opts: BuildBrandPromptOptions): string {
  const { template, infoVariantId } = opts;

  switch (template) {
    case "intro":
      return buildIntroPrompt(opts);
    case "info":
      // info-1만 활성. 향후 info-2 추가 시 분기 추가.
      if (infoVariantId === "info-1" || !infoVariantId) {
        return buildInfo1Prompt(opts);
      }
      throw new Error(`알 수 없는 정보성글 변형: ${infoVariantId}`);
    case "value-proof":
      return buildValueProofPrompt(opts);
    case "detail":
      throw new Error("상세페이지글은 아직 준비중입니다.");
    default:
      throw new Error(`알 수 없는 템플릿: ${template}`);
  }
}
