/**
 * 프로젝트 설정값 (하드코딩 방지)
 */
export const CONFIG = {
  /** 글 생성/제목 생성에 사용하는 AI 모델 */
  GENERATION_MODEL: "gemini-2.5-flash",
  /** 레퍼런스 분석에 사용하는 AI 모델 (더 정확한 분석 필요) */
  ANALYSIS_MODEL: "gemini-2.5-pro",
  /** 기본 글자수 범위 */
  DEFAULT_CHAR_RANGE: { min: 1500, max: 2000, label: "1500~2000자" },
  /** Python 자동 포스팅 백엔드 URL */
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8000",
} as const;
