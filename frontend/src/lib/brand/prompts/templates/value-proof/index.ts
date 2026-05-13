/**
 * 가치입증글 변형 등록부.
 *
 * 정보성글 INFO_VARIANTS와 동일 패턴.
 */
import { Edit3 } from "lucide-react";
import type { BrandValueProofVariantId } from "@/types/brand";

export interface ValueProofVariantMeta {
  id: BrandValueProofVariantId;
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
  isCustom?: boolean;
  isLibrary?: boolean;
}

export const VALUE_PROOF_VARIANTS: ValueProofVariantMeta[] = [
  {
    id: "value-proof-custom",
    name: "직접 레퍼런스",
    description:
      "평소 마음에 드는 가치입증글 1개를 직접 던지면, 그 글의 톤·구조 그대로 새 글이 작성됩니다.",
    icon: Edit3,
    flow: ["글 던지기", "구조 분석", "주제 입력", "맞춤 생성"],
    isCustom: true,
  },
];
