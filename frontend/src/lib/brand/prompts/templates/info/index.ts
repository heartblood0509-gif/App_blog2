/**
 * 정보성글 변형 등록부.
 *
 * 새 변형을 추가하려면:
 *   1. info-N/ 폴더 생성 (prompt.ts + reference.ts)
 *   2. 아래 INFO_VARIANTS 배열에 추가
 *   3. types/brand.ts 의 BrandInfoVariantId 유니언에 "info-N" 추가
 *
 * → UI(BrandTemplateSection)에 자동 노출됨.
 */
import type { BrandInfoVariantId } from "@/types/brand";

export interface InfoVariantMeta {
  id: BrandInfoVariantId;
  label: string;
  description: string;
}

export const INFO_VARIANTS: InfoVariantMeta[] = [
  {
    id: "info-1",
    label: "정보성글 1",
    description: "Hook → Crisis → Solution → CTA 골격",
  },
];
