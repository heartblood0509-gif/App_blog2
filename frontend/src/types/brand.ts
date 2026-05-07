// 브랜드 블로그 모드 전용 타입
// 후기성(types/index.ts)과 격리되며, 공용 타입(ImageSlot, UserPhoto, QualityResult, CharCountRange)만 ./index 에서 import
import type { ImageSlot, UserPhoto, QualityResult, CharCountRange } from "./index";

// ─────────────────────────────────────────────
// 브랜드 프로필 (Step 1에서 선택, 백엔드 brand_profiles.json 에 저장)
// ─────────────────────────────────────────────

/** 1인칭 화자 — 윤희 이사 고정 */
export interface BrandNarrator {
  name: string;
  role: string;
  authority: string;
  character: string;
  /** 1인칭 화자 고정 플래그 */
  fixed: true;
}

/** 주변 인물로만 등장 — 임두환 대표 */
export interface BrandSupportingPersona {
  name: string;
  role: string;
  authority: string;
  character: string;
  /** "주변 인물로만" 등 등장 방식 메모 */
  appearAs: string;
}

/** 브랜드 스토리 (소개글에서 가장 많이 활용) */
export interface BrandStory {
  origin: string;
  crisis: string;
  revival: string;
  encounter: string;
}

/** 실제 에피소드 */
export interface BrandEpisode {
  /** "위기 대응" | "감동" | "단골 멘트" 등 */
  type: string;
  content: string;
}

export interface BrandTargets {
  primary: string;
  secondary?: string;
  tertiary?: string;
}

export interface BrandCta {
  channels: string[];
}

export interface BrandForbidden {
  /** 경쟁사 실명 검출 활성 여부 */
  competitorNames: boolean;
  /** 추가 금지 단어 (예: "한세계 여행사") */
  forbiddenWords: string[];
  /** 광고성 직접 표현 검출 활성 여부 */
  adStyle: boolean;
}

export interface BrandProfile {
  id: string;
  label: string;

  // 기본 정보
  name: string;
  category: string;
  oneLine: string;
  coreValues: string[];

  // 인물
  narrator: BrandNarrator;
  supportingPersona: BrandSupportingPersona;

  // 스토리·에피소드
  story: BrandStory;
  episodes: BrandEpisode[];

  // 권위·서비스
  authorityAssets: string[];
  services: string[];

  // 타겟·차별점
  targets: BrandTargets;
  differentiators: string[];

  // 빌런·비유·표현
  villains: string[];
  metaphors: string[];
  signaturePhrases: string[];

  // 추가
  recommendedRoutes: string[];
  cta: BrandCta;
  forbidden: BrandForbidden;
}

// ─────────────────────────────────────────────
// 템플릿
// ─────────────────────────────────────────────

/** 4개 템플릿 ID */
export type BrandTemplateId =
  | "intro" // 소개글
  | "info" // 정보성글
  | "value-proof" // 가치입증글
  | "detail"; // 상세페이지글 (UI에서 비활성)

/** 정보성글 변형 — info-1~4는 코드 보존용(UI 미노출), info-custom + info-5가 활성 */
export type BrandInfoVariantId =
  | "info-1"
  | "info-2"
  | "info-3"
  | "info-4"
  | "info-5"
  | "info-custom";

// ─────────────────────────────────────────────
// 정보 명제 (Distill 결과 — 정보성글 전용)
//
// 브랜드 프로필을 LLM에 직접 주입하면 본문에 회사명·인물명·시그니처가 새므로,
// 1단계 distill 호출에서 "정보 명제"로 추상화한 뒤 2단계 본문 생성에 사용한다.
// 정보성글에서만 의미 있음 (intro/value-proof/detail은 미사용).
// ─────────────────────────────────────────────

export interface BrandProposition {
  /** 일반 정보 명제 1~2문장. 회사명·인물명 노출 금지 */
  statement: string;
  /** 명제를 뒷받침하는 구체 수치/근거 (브랜드명 X) */
  evidence: string;
  /** 출처 라벨 (디버깅·UI용). "차별점#2", "권위자산#3" 등 */
  source: string;
}

export interface DistillResult {
  /** 5~10개 명제 */
  propositions: BrandProposition[];
  /** 캐시 재사용 판정 키. `${profileId}:${mainKeyword}` */
  cacheKey: string;
}

// ─────────────────────────────────────────────
// 위저드 상태 (후기성 WizardState 와 격리된 별개 타입)
// ─────────────────────────────────────────────

export interface BrandTitleSuggestion {
  title: string;
  type: string;
}

export interface BrandWizardState {
  // Step 1: 브랜드 프로필 선택
  selectedProfileId: string | null;

  // Step 2: 템플릿 선택
  selectedTemplate: BrandTemplateId | null;
  /** 정보성글일 때만 사용. 다른 템플릿이면 null */
  selectedInfoVariant: BrandInfoVariantId | null;

  // Step 3: 글 설정
  mainKeyword: string;
  subKeywords: string;
  requirements: string;
  charCountRange: CharCountRange;

  // Step 4: 제목
  titleSuggestions: BrandTitleSuggestion[];
  selectedTitle: string;

  // Step 5: 생성 결과
  generatedContent: string;
  qualityResult: QualityResult | null;

  // Step 5: 이미지 (후기성과 동일 구조 — 인프라 공유)
  imageSlots: ImageSlot[];
  userPhotosBySlot: Record<string, UserPhoto>;
  excludedSlotIds: string[];
  generatedImages: Record<string, string>;
  isGeneratingBySlot: Record<string, boolean>;
  isImageGenerating: boolean;
  customPromptsBySlot: Record<string, string>;

  // 진행 상태
  currentStep: number;
  isLoading: boolean;
}
