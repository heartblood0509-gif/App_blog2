/**
 * AEO 글 생성 프롬프트 — 글 타입별 dispatch.
 *
 * - informational → buildInformationalPrompt
 * - comparison    → buildComparisonPrompt
 */
import type { AeoProfile, AeoTemplateId, AeoSource } from "@/types/aeo";
import { buildInformationalPrompt } from "./templates/informational/prompt";
import { buildComparisonPrompt } from "./templates/comparison/prompt";

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
}

export function buildAeoGenerationPrompt(opts: BuildAeoPromptOptions): string {
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
