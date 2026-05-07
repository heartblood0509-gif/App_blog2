/**
 * 브랜드 글 생성 — 템플릿별 dispatch 진입점.
 *
 * 정보성글(info-5, info-custom)은 distill로 추출한 propositions가 필수.
 * 호출 측(page.tsx)에서 distill을 먼저 실행한 뒤 결과를 함께 넘겨야 한다.
 */
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  BrandProposition,
} from "@/types/brand";
import { buildIntroPrompt } from "./templates/intro/prompt";
import { buildInfo1Prompt } from "./templates/info/info-1/prompt";
import { buildInfo2Prompt } from "./templates/info/info-2/prompt";
import { buildInfo3Prompt } from "./templates/info/info-3/prompt";
import { buildInfo4Prompt } from "./templates/info/info-4/prompt";
import { buildInfo5Prompt } from "./templates/info/info-5/prompt";
import { buildInfoCustomPrompt } from "./templates/info/info-custom/prompt";
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
  /** info-custom 모드 전용 — 사용자가 제공한 견본 글 본문 */
  referenceText?: string;
  /** info-custom 모드 전용 — 견본 글 구조 분석 결과 */
  referenceAnalysis?: string;
  /** 정보성글(info-5, info-custom) 전용 — distill API에서 추출한 정보 명제 */
  propositions?: BrandProposition[];
}

export function buildBrandGenerationPrompt(opts: BuildBrandPromptOptions): string {
  const { template, infoVariantId } = opts;

  switch (template) {
    case "intro":
      return buildIntroPrompt(opts);
    case "info":
      // 활성 변형 — propositions 필수 (각 빌더 내부에서 검증)
      if (infoVariantId === "info-custom") return buildInfoCustomPrompt(opts);
      if (infoVariantId === "info-5") return buildInfo5Prompt(opts);
      // 보존(archived) 변형 — UI 미노출이지만 옛 동작 보존을 위해 호출 가능 상태로 둠
      if (infoVariantId === "info-1" || !infoVariantId) return buildInfo1Prompt(opts);
      if (infoVariantId === "info-2") return buildInfo2Prompt(opts);
      if (infoVariantId === "info-3") return buildInfo3Prompt(opts);
      if (infoVariantId === "info-4") return buildInfo4Prompt(opts);
      throw new Error(`알 수 없는 정보성글 변형: ${infoVariantId}`);
    case "value-proof":
      return buildValueProofPrompt(opts);
    case "detail":
      throw new Error("상세페이지글은 아직 준비중입니다.");
    default:
      throw new Error(`알 수 없는 템플릿: ${template}`);
  }
}
