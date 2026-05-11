// AEO 블로그 모드 전용 타입.
// 후기성(types/index.ts) / 브랜드(types/brand.ts)와 격리. 공용 타입만 ./index 에서 import.
import type { ImageSlot, UserPhoto, QualityResult, CharCountRange } from "./index";

// ─────────────────────────────────────────────
// AEO 프로필 (단순화 8개 칸)
// 백엔드 aeo_profiles.json 에 저장
// ─────────────────────────────────────────────

/** [4] 작성자 신원 */
export interface AeoIdentity {
  /** 직접 경험 (한 줄, 예: "약사 8년차, 두 아이 엄마") */
  experience: string;
  /** 자격·경력 목록 */
  credentials: string[];
}

/** [8] 절대 쓰지 않는 말 */
export interface AeoForbidden {
  enabled: boolean;
  words: string[];
}

export interface AeoProfile {
  id: string;            // "aeo1", "aeo2", ...
  label: string;         // [1] 표시명
  name: string;          // [1] 프로필 이름
  category: string;      // [2] 카테고리
  oneLineIntro: string;  // [3] 한 줄 소개 (AI가 우릴 어떻게 기억할지)
  identity: AeoIdentity; // [4] 나는 누구
  audience: string;      // [5] 누구에게 도움 주나
  /** [6] 추천 기준 — 배열 순서가 곧 우선순위 */
  recommendationCriteria: string[];
  /** [7] 자주 인용하는 출처 */
  trustedSources: string[];
  forbidden: AeoForbidden; // [8] 절대 쓰지 않는 말
}

// ─────────────────────────────────────────────
// 글 타입 (MVP 2종)
// ─────────────────────────────────────────────

/** AEO 글 타입 — MVP는 informational, comparison 2종 */
export type AeoTemplateId =
  | "informational"  // 정보성글
  | "comparison";    // 비교·추천글

// ─────────────────────────────────────────────
// AEO 특화 입력 (Step 2에서 채워짐)
// ─────────────────────────────────────────────

/** Phase 3에서 자동 추론 후 사용자 확정한 자연어 질문 */
export type AeoTargetQuery = string;

/** 출처/근거 항목 (URL 또는 메모) */
export interface AeoSource {
  url?: string;
  note?: string;
}

// ─────────────────────────────────────────────
// 위저드 상태 (브랜드와 격리)
// 후기성 WizardState 와 공유될 일부 필드는 types/index.ts WizardState 에 추가
// ─────────────────────────────────────────────

export interface AeoTitleSuggestion {
  title: string;
  type: string;
}

export interface AeoWizardState {
  selectedProfileId: string | null;
  selectedTemplate: AeoTemplateId | null;
  targetQueries: AeoTargetQuery[];
  sources: AeoSource[];

  mainKeyword: string;
  subKeywords: string;
  requirements: string;
  charCountRange: CharCountRange;

  titleSuggestions: AeoTitleSuggestion[];
  selectedTitle: string;

  generatedContent: string;
  qualityResult: QualityResult | null;

  imageSlots: ImageSlot[];
  userPhotosBySlot: Record<string, UserPhoto>;
  excludedSlotIds: string[];
  generatedImages: Record<string, string>;
  isGeneratingBySlot: Record<string, boolean>;
  isImageGenerating: boolean;
  customPromptsBySlot: Record<string, string>;

  currentStep: number;
  isLoading: boolean;
}
