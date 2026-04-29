// 제품 관련 타입
export type ProductId =
  | "hair-loss-shampoo"
  | "therapy-shampoo"
  | "body-lotion"
  | "soap"
  | "scalp-brush"
  | "hair-tonic";

export interface ProductInfo {
  id: ProductId;
  name: string;
  category: string;
  relatedSymptoms: string[];
  naturalMentionPatterns: string[];
  ingredientPoints: string[];
  defaultAdvantages: string;
  /** 실제 사용자 후기 (톤 레퍼런스용) */
  realReviews?: string[];
  /** 제품의 핵심 인사이트 (AI가 방향성을 잡는 데 사용) */
  keyInsight?: string;
  /** 감각 표현 키워드 (AI가 디테일 묘사할 때 참고) */
  sensoryDetails?: string[];
}

export interface SelectedProduct {
  id: ProductId;
  advantages: string;
}

// 서사 구조 타입
export type NarrativeType = "empathy-first" | "conclusion-first";

/**
 * Step 2에서 선택하는 "글 소스" 모드.
 * - empathy-first: 감정 선공형 템플릿 + 내장 레퍼런스
 * - conclusion-first: 결론 선공형 템플릿 + 사용자 제공 URL (Phase A에서는 URL 필수)
 * - custom-reference: 사용자 레퍼런스 URL만 사용, 서사 템플릿 미적용
 */
export type NarrativeSource =
  | "empathy-first"
  | "conclusion-first"
  | "custom-reference";

// 말투 타입
export type ToneType = "존댓말" | "반말" | "음슴체";

// 콘텐츠 채널 타입 (블로그 외엔 향후 활성화 예정)
export type Channel = "blog" | "thread" | "youtube" | "detail-page";

// 블로그 포스팅 카테고리 (channel === "blog"일 때만 의미)
export type PostCategory = "review" | "brand" | "aeo";

// 글자수 범위
export interface CharCountRange {
  min: number;
  max: number;
  label: string;
}

// ─────────────────────────────────────────────
// 이미지 관련 타입
// ─────────────────────────────────────────────

/** 본문의 [이미지: 설명] 마커에서 파싱된 슬롯 */
export interface ImageSlot {
  /** 고유 ID (uuid) */
  id: string;
  /** 본문에서 마커가 등장한 순서 (0부터) */
  index: number;
  /** 마커의 설명 텍스트 */
  description: string;
  /** 같은 groupId면 페어 (연속된 2개) */
  groupId: string | null;
  /** 페어일 때의 역할 */
  pairRole?: "first" | "second";
  /** 원본 content의 라인 인덱스 */
  lineIndex: number;
}

/** 이미지 슬롯의 모드: AI 전체 생성 or 실사 사진 기반 변환 */
export type ImageMode = "ai" | "userPhoto";

/** 사용자가 업로드한 실사 사진 (AI 변환 시 원본 참조용) */
export interface UserPhoto {
  /** base64 (data URL prefix 없음) */
  base64: string;
  /** MIME 타입 (예: "image/jpeg") */
  mimeType: string;
  /** AI 변환 시 사용할 지시사항 (예: "집 밖에서 두 손으로 들고") */
  instruction: string;
  /** 고품질 변환 모드 (Pro 모델 사용, 느리지만 인물 일관성 우수) */
  useProModel?: boolean;
}

/** 이미지 생성 결과 (슬롯별) */
export interface ImageGenerationResult {
  slotId: string;
  status: "done" | "failed";
  /** base64 (data URL prefix 없음), status=done일 때만 */
  base64?: string;
  /** mime type (일반적으로 image/png) */
  mimeType?: string;
  /** 실패 시 사유 */
  error?: string;
}

// 위저드 단계별 설정
export interface WizardState {
  // Step 1: 제품 선택 + 장점
  selectedProducts: SelectedProduct[];

  /** Step 1에서 선택한 콘텐츠 채널 (현재는 "blog"만 활성) */
  channel: Channel | null;

  /** Step 2에서 선택한 블로그 포스팅 카테고리 (channel === "blog"일 때만 의미) */
  postCategory: PostCategory | null;

  // Step 2: 글 구조 & 말투
  /** 사용자가 Step 2에서 선택한 글 소스 모드 (3택) */
  narrativeSource: NarrativeSource | null;
  /** 프롬프트에 전달할 서사 구조. narrativeSource에서 파생 (custom-reference면 null) */
  narrativeType: NarrativeType | null;
  toneType: ToneType | null;
  toneExample: string;
  /**
   * 레퍼런스 블로그 URL.
   * - narrativeSource가 "conclusion-first" 또는 "custom-reference"면 필수
   * - "empathy-first"면 선택 사항 (비우면 내장 레퍼런스 사용)
   */
  referenceUrl: string;

  // Step 3: 글 설정
  mainKeyword: string;
  subKeywords: string;
  persona: string;
  requirements: string;
  charCountRange: CharCountRange;

  // Step 4: 제목 선택
  titleSuggestions: TitleSuggestion[];
  selectedTitle: string;

  // Step 5: 생성 결과
  generatedContent: string;
  qualityResult: QualityResult | null;

  // Step 5: 이미지 슬롯 관련
  /** 본문에서 파싱된 이미지 슬롯 (content가 바뀌면 재계산) */
  imageSlots: ImageSlot[];
  /** slotId → 사용자 업로드 원본 사진 (AI 변환 대상) */
  userPhotosBySlot: Record<string, UserPhoto>;
  /** 페어 중 사용 안 할 슬롯 ID들 */
  excludedSlotIds: string[];
  /** slotId → 현재 블로그에 쓰일 최종 이미지 base64 (AI 생성물/업로드 원본/변환물) */
  generatedImages: Record<string, string>;
  /** slotId → 해당 슬롯만 개별 생성/변환 중인지 */
  isGeneratingBySlot: Record<string, boolean>;
  /** 일괄 생성 중 여부 */
  isImageGenerating: boolean;
  /** slotId → 사용자가 수정한 커스텀 이미지 프롬프트 (AI 생성 모드 전용). 없으면 기본 빌더 사용 */
  customPromptsBySlot: Record<string, string>;

  // 현재 단계
  currentStep: number;

  // 레퍼런스 분석 결과
  referenceAnalysis: string;

  // 로딩 상태
  isLoading: boolean;
}

export interface TitleSuggestion {
  title: string;
  type: string;
}

// 품질 검증 결과
export interface QualityResult {
  charCount: number;
  charCountWithoutSpaces: number;
  keywordCount: number;
  keywordDensity: number;
  forbiddenWords: ForbiddenWordMatch[];
  adExpressions: string[];
  subheadingCount: number;
  hashtagCount: number;
  imageMarkerCount: number;
  isPass: boolean;
  failReasons: string[];
}

export interface ForbiddenWordMatch {
  word: string;
  replacement: string;
  position: number;
}

// 블로그 계정
export interface BlogAccount {
  id: string;
  label: string;
  naver_id: string;
}
