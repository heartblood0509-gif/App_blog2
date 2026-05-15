/**
 * 상세페이지글 변형 등록부.
 *
 * 정적 카드는 현재 없음 — builtin 카드만 동적 fetch.
 * "직접 레퍼런스"는 별도 최상위 템플릿 "내 템플릿 만들기"(BrandTemplateId="custom")로 분리됨.
 */
import type { BrandDetailVariantId } from "@/types/brand";

export interface DetailVariantMeta {
  id: BrandDetailVariantId;
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
  isLibrary?: boolean;
}

export const DETAIL_VARIANTS: DetailVariantMeta[] = [];
