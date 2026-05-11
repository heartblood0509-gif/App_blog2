/**
 * 정보성글 변형 등록부.
 *
 * 새 변형을 추가하려면:
 *   1. info-N/ 폴더 생성 (prompt.ts + reference.ts)
 *   2. 아래 INFO_VARIANTS 배열에 추가
 *   3. types/brand.ts 의 BrandInfoVariantId 유니언에 "info-N" 추가
 *   4. lib/brand/prompts/generation.ts 의 case "info" switch에 분기 추가
 *
 * → UI(BrandTemplateSection)에 자동 노출됨.
 *
 * 메타 구조는 후기성 NARRATIVES (step-narrative.tsx)와 동일:
 *   id / name / description / icon / flow
 *
 * 현재 정책:
 *   - 크루즈 박힘 4타입(info-1~4)은 UI 미노출, 코드는 보존(롤백용 → INFO_VARIANTS_ARCHIVED).
 *   - 활성: info-5(함정 폭로형) + info-custom(직접 레퍼런스).
 *   - 추상 서사 타입은 사용자가 레퍼런스 글 줄 때마다 1개씩 점진 추가.
 */
import { Edit3, Sparkles } from "lucide-react";
import type { BrandInfoVariantId } from "@/types/brand";

export interface InfoVariantMeta {
  id: BrandInfoVariantId;
  /** 카드 상단 — 타입명 (후기성 NARRATIVES.name과 동일 역할) */
  name: string;
  /** 카드 본문 — 한 단락 설명문 */
  description: string;
  /** 카드 아이콘 (lucide-react) */
  icon: React.ElementType;
  /** 카드 하단 chips — 글의 흐름 단계명 */
  flow: string[];
  /** ⭐ 최종장 뱃지 (info-4 같은 큰그림형) */
  isFinale?: boolean;
  /** 사용자 입력 레퍼런스 카드 — 클릭 시 입력 영역 노출 */
  isCustom?: boolean;
  /** 보관함 분석 선택 카드 — 클릭 시 분석 선택 UI 노출 */
  isLibrary?: boolean;
}

export const INFO_VARIANTS: InfoVariantMeta[] = [
  {
    id: "info-custom",
    name: "직접 레퍼런스",
    description:
      "평소 마음에 드는 글 1개를 직접 던지면, 그 글의 톤·구조 그대로 새 글이 작성됩니다. 어떤 브랜드든 사용 가능한 만능 키.",
    icon: Edit3,
    flow: ["글 던지기", "구조 분석", "주제 입력", "맞춤 생성"],
    isCustom: true,
  },
];

/**
 * 보존(코드 롤백용) — 크루즈 산업 전용 4타입.
 * 부활하려면 INFO_VARIANTS 배열에 다시 펼쳐 넣으면 됨.
 * UI 미노출이므로 description / flow는 placeholder 수준만 유지.
 */
export const INFO_VARIANTS_ARCHIVED: InfoVariantMeta[] = [
  {
    id: "info-1",
    name: "상품 비교",
    description: "우리끼리09 vs 타 여행사 크루즈. 숨은 비용을 폭로하고 정직한 올인클루시브로 설득.",
    icon: Sparkles,
    flow: ["가격 의문", "함정 폭로", "추가 비용", "올인클루시브", "마무리"],
  },
  {
    id: "info-2",
    name: "방식 비교",
    description: "크루즈 자유여행(직구) vs 패키지. 자기 실패 고백으로 전문가 동행 가치 설득.",
    icon: Sparkles,
    flow: ["딜레마", "자기 고백", "전문가 동행", "차별 루트", "마무리"],
  },
  {
    id: "info-3",
    name: "수단 비교",
    description: "유럽 일반 패키지(버스) vs 크루즈. 매일 짐싸기·버스 7시간 같은 체력 소모 직격.",
    icon: Sparkles,
    flow: ["버스 공포", "5단 비교", "치트키", "스케줄", "마무리"],
  },
  {
    id: "info-4",
    name: "가치 비교",
    description: "모든 유럽 여행 방식 vs 크루즈. 여행의 본질을 정의하며 우아·정의 톤으로 마무리.",
    icon: Sparkles,
    flow: ["캐리어 전쟁", "양방 비판", "본질 정의", "한정 스케줄", "감동 마무리"],
    isFinale: true,
  },
];
