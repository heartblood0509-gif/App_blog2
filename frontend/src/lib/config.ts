/**
 * 프로젝트 설정값 (하드코딩 방지)
 */
export const CONFIG = {
  /** 글 생성/제목 생성에 사용하는 AI 모델 */
  GENERATION_MODEL: "gemini-2.5-flash",
  /** 레퍼런스 분석에 사용하는 AI 모델 (더 정확한 분석 필요) */
  ANALYSIS_MODEL: "gemini-2.5-pro",
  /** 이미지 생성/변환 기본 모델 (Flash — 빠르고 저렴). GA명 — -preview 는 2026-06-25 셧다운. */
  IMAGE_MODEL: "gemini-3.1-flash-image",
  /** 이미지 고품질 모드 모델 (Pro — 인물 일관성 우수, 느리고 비쌈). GA명 — -preview 는 2026-06-25 셧다운. */
  IMAGE_MODEL_PRO: "gemini-3-pro-image",
  /** AI 변환 프리패스(피사체 1줄 식별) 모델. flash로 충분(블로그 본문을 근거로 제공). 부위 오인 지속 시 ANALYSIS_MODEL(pro)로 상향 */
  TRANSFORM_SUBJECT_MODEL: "gemini-2.5-flash",
  /** 기본 글자수 범위 */
  DEFAULT_CHAR_RANGE: { min: 1500, max: 2000, label: "1500~2000자" },
  /** 한 글당 목표 이미지 개수 */
  IMAGE_TARGET_COUNT: { min: 8, max: 10 },
  /** 이미지 생성 실패 시 재시도 횟수 (중립화 프롬프트로) */
  IMAGE_MAX_RETRIES: 1,

  // ── 이미지 일괄 생성 (클라이언트 풀) ──
  /** 동시에 진행할 슬롯 fetch 개수의 기본값 (AIMD의 상한이기도 함).
   *  동시 3장은 같은 키로 요청이 몰려 장당 응답이 느려지고 일부가 slot timeout(아래)에 걸린다.
   *  주 병목은 RPM(429)이 아니라 '응답 지연'이라, Tier1에서도 2가 안전하다. */
  IMAGE_BULK_CONCURRENCY_DEFAULT: 2,
  /** 새 슬롯 fetch 시작 사이 최소 간격 — RPM 안전장치 (ms) */
  IMAGE_BULK_MIN_START_INTERVAL_MS: 6_000,
  /** 슬롯 한 장당 클라이언트측 timeout (ms).
   *  Pro/고해상도는 90초를 넘길 수 있어 120초로 여유를 둔다. standalone 서버에선
   *  maxDuration 이 무효라, 이 클라측 컷이 실질적으로 유일한 마감 — 너무 짧으면 정상 생성도 잘린다. */
  IMAGE_PER_SLOT_TIMEOUT_MS: 120_000,
  /** 429/503/500/network 일시 에러 재시도 횟수 (timeout은 별도, 재시도 안 함) */
  IMAGE_TRANSIENT_RETRIES: 3,
  /** retryAfter 헤더가 없을 때 fallback backoff (ms) — 시도 N회차 = 배열[N-1].
   *  재시도 3회로 늘리며 3회차(30초)를 추가. 공식 권장 지수 백오프+지터(60초 cap 이내). */
  IMAGE_BACKOFF_FALLBACK_MS: [5_000, 15_000, 30_000] as readonly number[],
  /** network 에러용 짧은 backoff (ms) */
  IMAGE_BACKOFF_NETWORK_MS: [2_000, 5_000] as readonly number[],
  /** AIMD: 성공 N개 연속 시 동시성 +1 회복 */
  IMAGE_AIMD_RECOVERY_AFTER_N: 4,

  // ── fal.ai 이미지 (nano-banana — 블로그 이미지 fal 우선 경로) ──
  /** fal 기본 이미지 모델 (= gemini-3.1-flash-image, $0.08/장). */
  FAL_IMAGE_MODEL: "fal-ai/nano-banana-2",
  /** fal 고품질 이미지 모델 (= gemini-3-pro-image, $0.15/장 — 사진변환 Pro 전용). */
  FAL_IMAGE_MODEL_PRO: "fal-ai/nano-banana-pro",
  /** fal 사진 변환(image-to-image, 기본) 엔드포인트. image_urls 에 base64 data URI 입력. */
  FAL_IMAGE_EDIT_MODEL: "fal-ai/nano-banana-2/edit",
  /** fal 사진 변환 Pro 엔드포인트. */
  FAL_IMAGE_EDIT_MODEL_PRO: "fal-ai/nano-banana-pro/edit",

  // ── OpenAI(ChatGPT) 제공자 ──
  /** OpenAI 텍스트 모델 (사용자가 ChatGPT 모드에서 둘 중 선택). */
  OPENAI_TEXT_MODELS: { mini: "gpt-5.4-mini", full: "gpt-5.5" },
  /** OpenAI 이미지 모델 (고정). */
  OPENAI_IMAGE_MODEL: "gpt-image-2",
  /** OpenAI 이미지 품질 — 기본 슬롯 / 고품질(useProModel) 슬롯. */
  OPENAI_IMAGE_QUALITY: { default: "medium", pro: "high" },

  // ── 텍스트 생성 재시도 (제목·본문·분석 등) ──
  /** 429/503/500 일시 에러 재시도 횟수 (첫 시도 + N회 = 총 N+1회).
   *  Electron standalone이라 서버리스 시간제한이 없어 넉넉히 둘 수 있으나,
   *  사용자 대기 체감을 고려해 이미지(3)보다 약간 보수적으로. */
  TEXT_TRANSIENT_RETRIES: 2,
  /** retryAfter(서버가 준 대기시간)가 없을 때 fallback 지수 백오프 (ms). */
  TEXT_BACKOFF_MS: [4_000, 12_000] as readonly number[],
  /** 본문 품질 재생성(2차 생성) 시 재시도 상한 — (재생성 2회)×(재시도)로 인한
   *  누적 대기 폭증을 막기 위해 1차보다 짧게. */
  TEXT_REGEN_RETRIES: 1,

  /** Python 자동 포스팅 백엔드 URL */
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8000",
} as const;
