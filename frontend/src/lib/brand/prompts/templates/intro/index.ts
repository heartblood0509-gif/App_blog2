/**
 * 소개글 변형 등록부.
 *
 * 정적 카드는 현재 없음 — builtin 카드(보관함 builtin records)만 BrandTemplateSection이 동적 fetch.
 * "직접 레퍼런스"는 별도 최상위 템플릿 "내 템플릿 만들기"(BrandTemplateId="custom")로 분리됨.
 */
import type { BrandIntroVariantId } from "@/types/brand";

export interface IntroVariantMeta {
  id: BrandIntroVariantId;
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
  isLibrary?: boolean;
}

export const INTRO_VARIANTS: IntroVariantMeta[] = [];
