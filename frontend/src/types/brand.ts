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

/** 정보성글 변형 — info-1~4는 코드 보존용(UI 미노출), info-5/custom/structure-based가 활성 */
export type BrandInfoVariantId =
  | "info-1"
  | "info-2"
  | "info-3"
  | "info-4"
  | "info-5"
  | "info-custom"
  | "info-structure-based";

/** 소개글 변형 — 보관함 카드 기반 + 직접 레퍼런스 */
export type BrandIntroVariantId =
  | "intro-structure-based"
  | "intro-custom";

/** 가치입증글 변형 — 보관함 카드 기반 + 직접 레퍼런스 */
export type BrandValueProofVariantId =
  | "value-proof-structure-based"
  | "value-proof-custom";

/** 상세페이지글 변형 — 보관함 카드 기반 + 직접 레퍼런스 */
export type BrandDetailVariantId =
  | "detail-structure-based"
  | "detail-custom";

/** 분석 레코드가 속한 템플릿 범위 — 보관함 필터링 키 */
export type TemplateScope = "intro" | "info" | "value-proof" | "detail";

// ─────────────────────────────────────────────
// 제목 만드는 법 (titleFormula)
// ─────────────────────────────────────────────

/**
 * 톤 견본 1개 — 메인 키워드 뒤에 붙는 꼬리 패턴 + 라벨.
 *
 * builtin 카드는 7개 패턴, user 카드는 보통 1개 패턴(레퍼런스 제목에서 추출).
 * LLM은 이 견본의 톤을 학습 후 새 제목으로 변형 (그대로 베끼지 않음).
 */
export interface BrandTitleFormulaPattern {
  /** 패턴 라벨 — UI 표시용 (예: "후회 유도") */
  label: string;
  /** 메인 키워드 뒤에 붙는 꼬리 문장 (예: "모르고 진행하면 결국 후회하는 이유") */
  tail: string;
}

/**
 * 카드별 "제목 만드는 법" — 분석 마크다운과 분리된 별도 칸.
 *
 * 본문 생성에는 사용하지 않음. 제목 빌더에서만 import.
 */
export interface BrandTitleFormula {
  /** 구조 이름 (예: "함정 폭로형") */
  structureLabel: string;
  /** 허용 감정 화이트리스트 (예: ["공포", "손실회피", "의심"]) */
  emotions: string[];
  /** 공식 흐름 텍스트 (예: "메인 키워드 → 손해 암시 → 경고 또는 후회 유도") */
  formula: string;
  /** 톤 견본 패턴 목록 — builtin 7개, user 1개 권장 */
  patterns: BrandTitleFormulaPattern[];
}

// ─────────────────────────────────────────────
// 분석 보관함 — 사용자 분석 + 내장 템플릿 통합
// ─────────────────────────────────────────────

/**
 * 서사 구조 분석 레코드.
 *
 * 출처는 두 가지:
 * - "user": 사용자가 직접 레퍼런스 모드에서 분석 후 저장한 결과
 * - "builtin": 시스템 내장 템플릿 (예: 함정 폭로형)
 *
 * 핵심 원칙: 원본 견본 글 본문은 이 레코드에 저장하지 않는다.
 * 분석 마크다운(analysis) + 단계 라벨(flow) + 어미 패턴 통계 요약(excerptPattern)만 보관.
 */
export interface AnalysisRecord {
  id: string;
  /** UI 표시명 */
  label: string;
  /** "user" | "builtin" */
  sourceType: "user" | "builtin";
  /** 사용자 분석인 경우 원본 URL (있을 때만) */
  sourceUrl?: string;
  /** 분석 본문 (마크다운, FLOW/EXCERPTS HTML 코멘트는 제거된 형태) */
  analysis: string;
  /** 단계 라벨 — 카드 시각화 + 본문 흐름 가이드 */
  flow: string[];
  /** 어미·호흡 패턴 통계 요약 (raw excerpts 문장 X) */
  excerptPattern: string;
  /** ISO timestamp */
  createdAt: string;
  /** true면 사용자 삭제·수정 불가 */
  isBuiltin: boolean;
  /** 분석이 속한 템플릿 범위 — 보관함 분리용. 미지정 시 "info" fallback (하위호환) */
  templateScope?: TemplateScope;
  /** 제목 만드는 법 — 카드별 톤 견본. builtin은 시드로 채워지고, user는 분석 단계에서 AI가 채움 */
  titleFormula?: BrandTitleFormula;
}

/** 보관함 신규/수정 페이로드 (id·createdAt·isBuiltin 제외) */
export interface AnalysisRecordUpsert {
  label: string;
  sourceType: "user" | "builtin";
  sourceUrl?: string;
  analysis: string;
  flow: string[];
  excerptPattern: string;
  templateScope?: TemplateScope;
  titleFormula?: BrandTitleFormula;
}

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
  /** UI 뱃지에 표시될 라벨. 브랜드 모드는 "패턴 · 감정" 형태 (예: "후회 유도 · 공포") */
  type: string;
  /** 톤 견본 패턴 라벨 (있을 때만) */
  pattern?: string;
  /** 사용된 감정 (있을 때만) */
  emotion?: string;
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
