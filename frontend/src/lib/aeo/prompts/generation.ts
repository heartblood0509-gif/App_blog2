/**
 * AEO 글 생성 프롬프트 — 글 타입별 dispatch.
 *
 * - informational → buildInformationalPrompt
 * - comparison    → buildComparisonPrompt
 */
import type { AeoProfile, AeoTemplateId, AeoSource } from "@/types/aeo";
import type { UserProduct } from "@/types";
import { buildInformationalPrompt } from "./templates/informational/prompt";
import { buildComparisonPrompt } from "./templates/comparison/prompt";
import {
  buildAttachedProductBlock,
  aeoTemplateToAttachMode,
} from "@/lib/prompts/attached-product-context";

export interface BuildAeoPromptOptions {
  profile: AeoProfile;
  template: AeoTemplateId;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  requirements?: string;
  charCount: { min: number; max: number };
  targetQueries?: string[];
  sources?: AeoSource[];
  /**
   * V1 첨부 제품. undefined면 격리 패턴(A7)에 의해 기존 경로 100% 동일.
   */
  attachedProduct?: UserProduct;
}

function buildBaseAeoPrompt(opts: Omit<BuildAeoPromptOptions, "attachedProduct">): string {
  const { template, ...rest } = opts;

  switch (template) {
    case "informational":
      return buildInformationalPrompt(rest);
    case "comparison":
      return buildComparisonPrompt(rest);
    default: {
      const exhaustive: never = template;
      throw new Error(`Unknown AEO template: ${String(exhaustive)}`);
    }
  }
}

/**
 * AEO 글 생성 프롬프트 — 진입점.
 *
 * 격리 패턴 (A7): attachedProduct가 없으면 기존 경로 100% 동일.
 * 있을 때만 disclosure + reference 우선 룰 적용된 첨부 블록을 끝에 주입.
 */
export function buildAeoGenerationPrompt(opts: BuildAeoPromptOptions): string {
  const { attachedProduct, ...baseOpts } = opts;
  const basePrompt = buildBaseAeoPrompt(baseOpts);

  if (!attachedProduct) {
    return basePrompt;
  }

  // A4 reference 우선 룰: sources(reference)가 비어있지 않으면 hasReference=true
  const hasReference = Array.isArray(opts.sources) && opts.sources.length > 0;

  const attachedBlock = buildAttachedProductBlock(
    attachedProduct,
    aeoTemplateToAttachMode(opts.template),
    { hasReference },
  );

  return `${basePrompt}\n\n${attachedBlock}`;
}
