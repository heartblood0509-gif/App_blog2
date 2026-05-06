/**
 * 템플릿 ID → 레퍼런스 글 / 골격 프롬프트 로더.
 *
 * 새 변형 추가 시 여기에 import + switch 추가.
 */
import type { BrandTemplateId } from "@/types/brand";
import { INTRO_REFERENCE } from "./templates/intro/reference";
import { INFO_1_REFERENCE } from "./templates/info/info-1/reference";
import { VALUE_PROOF_REFERENCE } from "./templates/value-proof/reference";

export function getTemplateReference(
  template: BrandTemplateId,
  infoVariantId?: string | null
): string | null {
  switch (template) {
    case "intro":
      return INTRO_REFERENCE;
    case "info":
      if (infoVariantId === "info-1") return INFO_1_REFERENCE;
      return INFO_1_REFERENCE; // 기본값
    case "value-proof":
      return VALUE_PROOF_REFERENCE;
    case "detail":
      return null; // 준비중
    default:
      return null;
  }
}

export function getTemplateLabel(template: BrandTemplateId): string {
  switch (template) {
    case "intro":
      return "소개글";
    case "info":
      return "정보성글";
    case "value-proof":
      return "가치입증글";
    case "detail":
      return "상세페이지글";
  }
}
