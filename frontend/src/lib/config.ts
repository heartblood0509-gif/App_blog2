/**
 * 프로젝트 설정값 (하드코딩 방지)
 */
export const CONFIG = {
  /** 글 생성/제목 생성에 사용하는 AI 모델 */
  GENERATION_MODEL: "gemini-2.5-flash",
  /** 레퍼런스 분석에 사용하는 AI 모델 (더 정확한 분석 필요) */
  ANALYSIS_MODEL: "gemini-2.5-pro",
  /** 이미지 생성/변환 기본 모델 (Flash — 빠르고 저렴) */
  IMAGE_MODEL: "gemini-3.1-flash-image-preview",
  /** 이미지 고품질 모드 모델 (Pro — 인물 일관성 우수, 느리고 비쌈) */
  IMAGE_MODEL_PRO: "gemini-3-pro-image-preview",
  /** AI 변환 시 원본 이미지를 몇 번 반복해 넣을지 (1~4, 2 권장) */
  TRANSFORM_REFERENCE_COUNT: 2,
  /** 기본 글자수 범위 */
  DEFAULT_CHAR_RANGE: { min: 1500, max: 2000, label: "1500~2000자" },
  /** 한 글당 목표 이미지 개수 */
  IMAGE_TARGET_COUNT: { min: 8, max: 10 },
  /** 이미지 생성 실패 시 재시도 횟수 (중립화 프롬프트로) */
  IMAGE_MAX_RETRIES: 1,
  /** 이미지 생성 간 대기 시간 (레이트 리밋 대응, ms) */
  IMAGE_GENERATION_DELAY_MS: 3000,
  /** Python 자동 포스팅 백엔드 URL */
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8000",
} as const;
