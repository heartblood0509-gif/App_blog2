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

// 말투 타입
export type ToneType = "존댓말" | "반말" | "음슴체";

// 글자수 범위
export interface CharCountRange {
  min: number;
  max: number;
  label: string;
}

// 위저드 단계별 설정
export interface WizardState {
  // Step 1: 제품 선택 + 장점
  selectedProducts: SelectedProduct[];

  // Step 2: 글 구조 & 말투
  narrativeType: NarrativeType | null;
  toneType: ToneType | null;
  toneExample: string;

  // Step 3: 글 설정
  mainKeyword: string;
  subKeywords: string;
  persona: string;
  requirements: string;
  charCountRange: CharCountRange;
  referenceUrl: string;

  // Step 4: 제목 선택
  titleSuggestions: TitleSuggestion[];
  selectedTitle: string;

  // Step 5: 생성 결과
  generatedContent: string;
  qualityResult: QualityResult | null;

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
  isPass: boolean;
  failReasons: string[];
}

export interface ForbiddenWordMatch {
  word: string;
  replacement: string;
  position: number;
}
