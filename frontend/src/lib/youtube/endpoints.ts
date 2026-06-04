"use client";

// 유튜브 백엔드 API 의 타입드 래퍼. 필드명은 백엔드 계약(api/routes/*)과 1:1 일치해야 한다.
// 모든 호출은 same-origin 프록시(/api/youtube)를 경유한다.

import {
  ytDelete,
  ytGetBlob,
  ytGetJson,
  ytPostForm,
  ytPostJson,
  ytPutJson,
} from "./api";

// ── 콘텐츠 생성 ──────────────────────────────────────────────

/**
 * 카테고리/영상목적 공통 필드. 화장품(cosmetics)일 때만 content_type 및 부속 필드가 의미를 갖는다.
 * (원본 getCategoryPayload 와 같은 모양 — 백엔드는 불필요 필드를 무시한다.)
 */
export interface YtContentFields {
  category: string;
  content_type?: string;
  pain_point?: string;
  ingredient?: string;
  keyword?: string;
}

/** 화면 상태(원시값) → 백엔드 카테고리 페이로드. 여러 화면(narration/image-prompts)이 공유. */
export interface CategoryFieldsInput {
  category: string;
  contentType: string;
  painPoint: string;
  ingredient: string;
  keyword: string;
}
export function categoryFields(o: CategoryFieldsInput): YtContentFields {
  if (o.category !== "cosmetics") return { category: o.category };
  const f: YtContentFields = {
    category: o.category,
    content_type: o.contentType,
  };
  if (o.contentType === "promo") {
    if (o.painPoint.trim()) f.pain_point = o.painPoint.trim();
    if (o.ingredient.trim()) f.ingredient = o.ingredient.trim();
  } else if (o.contentType === "info") {
    if (o.keyword.trim()) f.keyword = o.keyword.trim();
  }
  return f;
}

export interface GenerateTitlesInput extends YtContentFields {
  topic: string;
}
/** 백엔드 TitleResponse.titles 의 항목. (api/models.py TitleOption) */
export interface TitleOption {
  title: string;
  hook: string;
}
export interface GenerateTitlesResult {
  titles: TitleOption[];
}
export function generateTitles(
  input: GenerateTitlesInput,
): Promise<GenerateTitlesResult> {
  return ytPostJson<GenerateTitlesResult>("/api/generate/titles", input);
}

// 나레이션 — 선택된 제목 기반 줄 생성(줄마다 text + role).
export interface NarrationLine {
  text: string;
  role: string;
}
export interface GenerateNarrationInput extends YtContentFields {
  topic: string;
  selected_title: string; // ≤30자 (백엔드 NarrationRequest 제약)
  num_lines: number; // promo_comment=5, 그 외=6 (백엔드 허용 5~8)
}
export interface GenerateNarrationResult {
  lines: NarrationLine[];
}
export function generateNarration(
  input: GenerateNarrationInput,
): Promise<GenerateNarrationResult> {
  return ytPostJson<GenerateNarrationResult>("/api/generate/narration", input);
}

// 이미지 프롬프트 — 확정 나레이션 → 줄별 이미지 프롬프트 + 모션(이후 job.lines 가 됨).
// 백엔드가 돌려주는 ScriptLine 은 그대로 job 생성 payload 의 lines 로 전달한다.
export interface ScriptLine {
  line_id?: string | null;
  text: string;
  image_prompt?: string;
  motion?: string;
  // Card B 줄별 자산 상태("pending" | "ready" | "failed").
  status?: string;
  asset_version?: number;
  fail_reason?: string | null;
  // 진행 표시용(생성/업로드 중 단계·메시지).
  asset_action?: string | null; // "ai_image" | "ai_clip" | "image_upload" | "clip_upload"
  asset_step?: string | null; // "queued" | "planning" | "generating" | "qa" | "retrying" | "saving" | "converting"
  asset_message?: string | null;
  // 그 외 백엔드 부가 필드는 그대로 통과.
  [key: string]: unknown;
}
// 백엔드 ImagePromptRequest 는 category/content_type 만 받는다(pain_point 등은 계약 외).
export interface GenerateImagePromptsInput {
  narration_lines: string[];
  style: string; // 'realistic'
  topic: string;
  category: string;
  content_type?: string;
}
export interface GenerateImagePromptsResult {
  lines: ScriptLine[];
}
export function generateImagePrompts(
  input: GenerateImagePromptsInput,
): Promise<GenerateImagePromptsResult> {
  return ytPostJson<GenerateImagePromptsResult>(
    "/api/generate/image-prompts",
    input,
  );
}

// ── TTS(음성) ────────────────────────────────────────────────

export interface TtsEmotion {
  value: string;
  label: string;
}
/** 성우의 사용 가능 감정 목록(typecast 전용). 키 없으면 실패 → 호출부에서 'normal' 폴백. */
export function ttsEmotions(voiceId: string): Promise<TtsEmotion[]> {
  return ytGetJson<TtsEmotion[]>(
    `/api/tts/emotions?voice_id=${encodeURIComponent(voiceId)}`,
  );
}

export interface TtsPreviewParams {
  engine: string;
  voice_id: string;
  speed: number;
  emotion: string;
}
/** 샘플 문장 미리듣기 mp3(고정 텍스트). */
export function ttsPreviewBlob(p: TtsPreviewParams): Promise<Blob> {
  const q = new URLSearchParams({
    engine: p.engine,
    voice_id: p.voice_id,
    speed: String(p.speed),
    emotion: p.emotion,
  });
  return ytGetBlob(`/api/tts/preview?${q.toString()}`);
}

// 음성 세션 사전 생성(promo_comment·카드 B). 카드 A 정보/홍보형은 렌더 시 생성하므로 호출 안 함.
export interface TtsPreviewBuildInput {
  sentences: string[];
  voice_id: string;
  speed: number;
  emotion: string;
  content_type?: string;
  topic?: string;
  style?: string;
  // 카드 B incremental 전용(카드 A 미사용).
  line_ids?: (string | null)[];
  existing_session_id?: string | null;
}
export interface TtsPreviewBuildResult {
  session_id: string;
  lines_count: number;
  durations: number[];
  split_count: number;
  expanded_sentences: string[];
  regenerated_indices: number[];
  incremental: boolean;
}
export function ttsPreviewBuild(
  input: TtsPreviewBuildInput,
): Promise<TtsPreviewBuildResult> {
  return ytPostJson<TtsPreviewBuildResult>("/api/tts/preview-build", input);
}

// ── BGM ──────────────────────────────────────────────────────

export interface BgmItem {
  id?: string;
  filename: string;
  duration: number;
  url: string; // 백엔드 root-relative (재생 시 ytUrl 로 감쌀 것)
}
export function listBgm(): Promise<BgmItem[]> {
  return ytGetJson<BgmItem[]>("/api/assets/bgm");
}
export interface BgmUploadResult {
  id?: string;
  filename: string;
  duration: number;
}
/** multipart 업로드(field=file). MP3/WAV/OGG ≤20MB, 최대 3개. */
export function uploadBgm(file: File): Promise<BgmUploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  return ytPostForm<BgmUploadResult>("/api/assets/bgm", fd);
}
export function deleteBgm(idOrFilename: string): Promise<{ message?: string }> {
  return ytDelete<{ message?: string }>(
    `/api/assets/bgm/${encodeURIComponent(idOrFilename)}`,
  );
}

// ── Job 생성(Card A 최종) ───────────────────────────────────

export interface JobCreateInput {
  topic: string;
  style: string; // 'realistic'
  video_mode: string; // 'kenburns'
  tts_engine: string;
  tts_speed: number;
  voice_id: string | null;
  emotion: string | null;
  title: string;
  title_line1: string;
  title_line2: string;
  lines: ScriptLine[];
  bgm_volume: number; // 0~0.5
  bgm_filename: string | null;
  bgm_start_sec: number;
  product_image_id: string | null;
  tts_session_id: string | null;
}
export interface JobResponse {
  job_id: string;
  status: string;
  progress: number;
  current_step: string;
  video_url?: string | null;
  error?: string | null;
  [key: string]: unknown;
}
export function createJob(input: JobCreateInput): Promise<JobResponse> {
  return ytPostJson<JobResponse>("/api/jobs/", input);
}

/** 단건 조회 — SSE 끊겼을 때 폴백 폴링용. */
export function getJob(jobId: string): Promise<JobResponse> {
  return ytGetJson<JobResponse>(`/api/jobs/${jobId}`);
}

// ── 미리보기 / 렌더 확정 ─────────────────────────────────────

export interface PreviewResponse {
  title: string;
  lines: ScriptLine[];
  image_urls: string[]; // 백엔드 root-relative (/api/jobs/{id}/images/{i}) — 렌더 시 ytUrl 로 감쌀 것
}
/** preview_ready/awaiting_confirmation 상태에서만 가능. 생성된 이미지+대본. */
export function getPreview(jobId: string): Promise<PreviewResponse> {
  return ytGetJson<PreviewResponse>(`/api/jobs/${jobId}/preview`);
}

export interface ConfirmRenderResult {
  message?: string;
  job_id?: string;
  next?: string; // 'render' | 'clips'
  task_id?: string;
}
/** 미리보기 확인 → 렌더(kenburns) 또는 클립생성(그 외) 시작. Card A 는 video_mode 만 보내면 됨. */
export function confirmRender(
  jobId: string,
  videoMode = "kenburns",
): Promise<ConfirmRenderResult> {
  return ytPostJson<ConfirmRenderResult>(`/api/jobs/${jobId}/confirm`, {
    video_mode: videoMode,
  });
}

// ── 이미지 줄별 재생성 / 업로드 (preview_ready) ──────────────

export interface RegenerateImageInput {
  korean_request?: string; // 한글 요청어(생략 시 현재 대본 텍스트 기준)
  english_prompt?: string; // 영어 프롬프트 직접 지정
}
export interface RegenerateImageResult {
  message?: string;
  task_id?: string;
  already_running?: boolean;
}
/**
 * 특정 줄 이미지를 AI 로 다시 생성. **비동기**(작업 큐) — 호출 직후 job.status 가
 * 'regenerating_image' 로 바뀌고, 워커가 끝나면 'preview_ready'(성공)/'failed'(실패)로 돌아온다.
 * 그래서 호출 측은 getJob 으로 상태가 'regenerating_image' 를 벗어날 때까지 폴링해야 한다.
 * Card A 는 본문 없이 호출하면 현재 프롬프트로 재생성.
 */
export function regenerateImage(
  jobId: string,
  lineIndex: number,
  body: RegenerateImageInput = {},
): Promise<RegenerateImageResult> {
  return ytPostJson<RegenerateImageResult>(
    `/api/jobs/${jobId}/regenerate-image/${lineIndex}`,
    body,
  );
}

export interface UploadImageResult {
  message?: string;
  image_url: string; // /api/jobs/{id}/images/{i}
  asset_version?: number | null; // Card A 는 null
}
/**
 * 특정 줄 이미지를 사용자 파일로 교체. **동기**(즉시 저장 후 응답) — 백엔드가 9:16 으로
 * cover-crop 한다. PNG/JPG/WebP, 10MB 이하만 허용(백엔드와 동일 검사를 호출 측에서도 선행).
 */
export function uploadImage(
  jobId: string,
  lineIndex: number,
  file: File,
): Promise<UploadImageResult> {
  const form = new FormData();
  form.append("file", file);
  return ytPostForm<UploadImageResult>(
    `/api/jobs/${jobId}/upload-image/${lineIndex}`,
    form,
  );
}

// ── Card B (직접 제공): 대본 분할 / draft / 줄별 상태 ──────────

export type LineSource = "ai" | "image" | "clip";

/** 사용자 대본을 문장 단위로 분할(정규식, AI·키 불필요, 원문 100% 보존). */
export function splitScript(script: string): Promise<{ lines: string[] }> {
  return ytPostJson<{ lines: string[] }>("/api/generate/split-script", {
    script,
  });
}

export interface DraftJobResponse {
  job_id: string;
  lines: ScriptLine[];
}
/** 쪼갠 대본으로 Card B draft job 생성(generation_mode=user_assets, status=preview_ready). */
export function createDraft(lines: string[]): Promise<DraftJobResponse> {
  return ytPostJson<DraftJobResponse>("/api/jobs/draft", { lines });
}

/** 줄별 자산 편집 화면의 진실원천. 폴링으로 줄별 status/asset_step 변화를 추적. */
export interface DraftState {
  job_id: string;
  status: string;
  generation_mode: string;
  intermediates_purged: boolean;
  video_url?: string | null;
  title?: string | null;
  title_line1?: string | null;
  title_line2?: string | null;
  lines: ScriptLine[];
  line_sources: LineSource[];
  [key: string]: unknown;
}
export function getDraftState(jobId: string): Promise<DraftState> {
  return ytGetJson<DraftState>(`/api/jobs/${jobId}/draft-state`);
}

export interface GenerateMissingImagesResult {
  queued: number[]; // 이번에 큐에 들어간 줄 index
  task_id?: string | null;
  status?: string;
  already_running?: boolean;
}
/** Card B: line_sources 가 'ai' 이고 이미지가 없는 줄을 일괄 AI 생성(비동기). */
export function generateMissingImages(
  jobId: string,
): Promise<GenerateMissingImagesResult> {
  return ytPostJson<GenerateMissingImagesResult>(
    `/api/jobs/${jobId}/generate-missing-images`,
    {},
  );
}

// ── API 키 (단일사용자 무인증, 백엔드 DB 직접 저장) ──────────

/** 설정 여부/마스킹 상태. 값은 마스킹 문자열 또는 null. */
export interface ApiKeysStatus {
  gemini: string | null;
  typecast: string | null;
  fal: string | null;
}
export function getApiKeys(): Promise<ApiKeysStatus> {
  return ytGetJson<ApiKeysStatus>("/api/auth/api-keys");
}
/** 보낸 키만 갱신. ""(빈문자)=삭제, 생략=변경 안 함. 비어있지 않으면 외부 검증 후 저장. */
export interface ApiKeysUpdateInput {
  gemini_api_key?: string;
  typecast_api_key?: string;
  fal_key?: string;
}
export function updateApiKeys(
  input: ApiKeysUpdateInput,
): Promise<{ message?: string }> {
  return ytPutJson<{ message?: string }>("/api/auth/api-keys", input);
}
