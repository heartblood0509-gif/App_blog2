/**
 * 소개글 변형 등록부.
 *
 * 정보성글 INFO_VARIANTS와 동일 패턴:
 *   - 내장 카드(보관함 builtin records)는 BrandTemplateSection이 동적 fetch
 *   - INTRO_VARIANTS는 정적 카드 (현재는 "직접 레퍼런스" 1개)
 *
 * 새 내장 카드를 추가하려면 analysis_records.json에 templateScope="intro"로 등록.
 */
import { Edit3 } from "lucide-react";
import type { BrandIntroVariantId } from "@/types/brand";

export interface IntroVariantMeta {
  id: BrandIntroVariantId;
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
  isCustom?: boolean;
  isLibrary?: boolean;
}

export const INTRO_VARIANTS: IntroVariantMeta[] = [
  {
    id: "intro-custom",
    name: "직접 레퍼런스",
    description:
      "평소 마음에 드는 소개글 1개를 직접 던지면, 그 글의 톤·구조 그대로 새 소개글이 작성됩니다.",
    icon: Edit3,
    flow: ["글 던지기", "구조 분석", "주제 입력", "맞춤 생성"],
    isCustom: true,
  },
];
