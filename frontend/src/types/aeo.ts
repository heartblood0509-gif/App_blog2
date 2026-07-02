// AEO 블로그 모드 전용 타입.
// 현재는 SEO·AEO 통합형(postCategory === "seoAeo")만 사용하며, 프로필 구조만 공유한다.
// 옛 "aeo" 단독 모드용 타입(AeoTemplateId, AeoSource, AeoTargetQuery, AeoTitleSuggestion, AeoWizardState)은
// 모드 제거와 함께 정리되었다.

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
  uuid?: string;         // 기기 공통 안정 식별자(동기화용)
  updatedAt?: string;    // 최종 수정 시각 ISO(동기화 LWW용)
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
