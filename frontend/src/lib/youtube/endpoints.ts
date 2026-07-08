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
  ytUrl,
} from "./api";
import type { LineTransform } from "./transform";
import type { WordTime } from "./subtitle-split";

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
  // Card B 자산 위치/배율. null/미설정 = 기본(cover, 화면 꽉 채움). 프리뷰=렌더 공유.
  transform?: { scale: number; x: number; y: number } | null;
  // Card B 줄별 자산 상태("pending" | "ready" | "failed").
  status?: string;
  asset_version?: number;
  fail_reason?: string | null;
  // 진행 표시용(생성/업로드 중 단계·메시지).
  asset_action?: string | null; // "ai_image" | "ai_clip" | "image_upload" | "clip_upload"
  asset_step?: string | null; // "queued" | "planning" | "generating" | "qa" | "retrying" | "saving" | "converting"
  asset_message?: string | null;
  // 카드 B 자막 조각(끊는 위치). null/부재 = 자동 분할(미확정). 텍스트 편집 시 백엔드가 리셋.
  subtitle_chunks?: string[] | null;
  // 카드 B 선트림 영상 조각. clip_start = 재생 시작 오프셋(초), clip_duration = 조각 총 길이(초).
  // null/부재 = 레거시(전체 저장 클립) → 시작점 조정 미지원.
  clip_start?: number | null;
  clip_duration?: number | null;
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
  // 줄별 어절 타임스탬프(자막-음성 동기화용). 폴백/구세션 줄은 null.
  word_times?: (WordTime[] | null)[];
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

// 세션 매니페스트 — 재열기 시 재빌드 없이 스냅샷(줄 순서·길이·음성)을 복원한다.
export interface TtsSessionManifest {
  session_id: string;
  line_ids: (string | null)[] | null; // 빌드 순서(= sent_XX 인덱스). 없으면 null → 재빌드 필요.
  line_hashes: Record<string, string> | null;
  durations: number[];
  word_times?: (WordTime[] | null)[] | null;
  voice: { voice_id: string | null; speed: number | null; emotion: string | null };
  lines_count: number;
}
export function getTtsSessionManifest(
  sessionId: string,
): Promise<TtsSessionManifest> {
  return ytGetJson<TtsSessionManifest>(`/api/tts/preview-session/${sessionId}`);
}

/** 세션의 한 줄 음성 wav URL(프록시 경유, 쿠키 인증). v = 빌드 버전(캐시버스터). */
export function ttsSessionLineUrl(
  sessionId: string,
  index: number,
  v: number,
): string {
  return `${ytUrl(`/api/tts/preview-session/${sessionId}/line/${index}`)}?v=${v}`;
}

// ── 자막 조각(끊는 위치) ──────────────────────────────────────

/** 카드 B: 한 줄의 자막 조각을 확정 저장. chunks=null 이면 자동 분할로 리셋.
 * 각 조각은 12자(표시 폭) 이하여야 하며, 초과 시 백엔드가 400. */
export function setSubtitleChunks(
  jobId: string,
  lineId: string,
  chunks: string[] | null,
): Promise<{ ok?: boolean }> {
  return ytPostJson<{ ok?: boolean }>(`/api/jobs/${jobId}/subtitle-chunks`, {
    line_id: lineId,
    chunks,
  });
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

/**
 * Card B(user_assets) 전용 confirm. draft job 에 음성·BGM·제목을 채워 렌더 시작.
 * 같은 `/confirm` 엔드포인트지만 Card A 와 달리 음성/BGM/제목 전체를 본문으로 보낸다.
 * **tts_session_id 는 필수**(없으면 백엔드 400 — 음성 단계 preview-build 로 미리 만들어야 함).
 */
export interface ConfirmDraftInput {
  video_mode?: string; // 'kenburns'(Card B 고정)
  tts_engine: string;
  tts_speed: number;
  voice_id: string;
  emotion: string | null;
  tts_session_id: string | null;
  bgm_filename: string | null;
  bgm_start_sec: number;
  bgm_volume: number; // 0~0.5
  title: string;
  title_line1: string;
  title_line2: string;
  title_font?: string;
  title_font_weight?: string;
  title_font_size?: number;
  title_color1?: string;
  title_color2?: string;
  // 제목 위치 오프셋(px). dx=가로 중앙 오프셋(1080폭), dy=기본 위치 기준 세로 델타(1920높이). 0/0=기존 위치.
  title_dx?: number;
  title_dy?: number;
  // 자막 스타일(작업 전역). 미지정이면 백엔드 기본(55px·흰색·기본폰트·중앙 y1300).
  subtitle_font?: string;
  subtitle_font_weight?: string;
  subtitle_font_size?: number;
  subtitle_color?: string;
  subtitle_dx?: number;
  subtitle_y?: number;
  // 줌(모션) 속도 — 작업 전역, 초당 확대 비율. 미지정이면 백엔드 기본(0.0125).
  motion_speed?: number;
  // 자막 조각 확정 맵(line_id → 조각들). 화면에 보여준 그대로 렌더에 박히게 한다(WYSIWYG).
  subtitle_chunks_by_line?: Record<string, string[]>;
}
export function confirmDraft(
  jobId: string,
  input: ConfirmDraftInput,
): Promise<ConfirmRenderResult> {
  return ytPostJson<ConfirmRenderResult>(`/api/jobs/${jobId}/confirm`, {
    video_mode: "kenburns",
    ...input,
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
 * 특정 줄 이미지를 사용자 파일로 교체. **동기**(즉시 저장 후 응답). 카드 B 는 원본 비율을
 * 그대로 보존하고(왜곡·잘림 없음, 긴 변 2560px 캡), 위치·배율은 프리뷰에서 사용자가 정한다.
 * PNG/JPG/WebP, 10MB 이하만 허용(백엔드와 동일 검사를 호출 측에서도 선행).
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

export interface UploadClipResult {
  message?: string;
  clip_url: string; // /api/jobs/{id}/clips/{i}
  asset_version?: number | null;
  // 선트림 업로드 시 저장된 조각 메타(전체 저장이면 null).
  clip_start?: number | null;
  clip_duration?: number | null;
}
/**
 * 특정 줄을 사용자 영상으로 교체. **동기**(저장 후 응답). MP4/MOV/WebM/AVI, 50MB 이하만 허용
 * (백엔드와 동일 검사를 호출 측에서도 선행). MP4 외 포맷은 백엔드가 FFmpeg 로 MP4 변환하므로
 * 이미지 업로드보다 응답이 느릴 수 있다. 성공 시 그 줄의 소스가 'clip' 으로 바뀐다.
 *
 * trim(선택 구간) 이 오면 백엔드가 선택 구간(±여유분)만 잘라 저장한다(웹 폴백 경로 — 파일 전송 O).
 * 데스크톱에선 파일 전송 없이 importClipSegment(경로만) 를 쓴다.
 */
export function uploadClip(
  jobId: string,
  lineIndex: number,
  file: File,
  trim?: { inSec: number; neededSec: number },
): Promise<UploadClipResult> {
  const form = new FormData();
  form.append("file", file);
  if (trim) {
    form.append("in_sec", String(trim.inSec));
    form.append("needed_sec", String(trim.neededSec));
  }
  return ytPostForm<UploadClipResult>(
    `/api/jobs/${jobId}/upload-clip/${lineIndex}`,
    form,
  );
}

/**
 * 데스크톱 전용: 로컬 원본 영상 경로에서 선택 구간(±여유분)만 잘라 임포트(파일 전송 없음 → 용량 무제한).
 * 백엔드는 LOCAL_SINGLE_USER(데스크톱)에서만 이 엔드포인트를 연다(웹에선 403).
 */
export function importClipSegment(
  jobId: string,
  lineIndex: number,
  lineId: string,
  srcPath: string,
  inSec: number,
  neededSec: number,
): Promise<UploadClipResult> {
  return ytPostJson<UploadClipResult>(
    `/api/jobs/${jobId}/import-clip-segment`,
    {
      line_index: lineIndex,
      line_id: lineId,
      src_path: srcPath,
      in_sec: inSec,
      needed_sec: neededSec,
    },
  );
}

export interface ClipProxyResult {
  proxy_url: string; // /api/jobs/{id}/clip-proxy-file?v=…
  duration: number;
}
/**
 * 데스크톱 전용: 로컬 원본 경로에서 저화질 H.264 미리보기본을 생성한다(HEVC 등 폰 영상 재생용).
 * 최종 영상엔 원본을 원화질로 잘라 쓰므로, 이 임시본은 구간 고르는 동안만 재생에 쓰고 이후 삭제한다.
 */
export function makeClipProxy(
  jobId: string,
  srcPath: string,
): Promise<ClipProxyResult> {
  return ytPostJson<ClipProxyResult>(`/api/jobs/${jobId}/clip-proxy`, {
    src_path: srcPath,
  });
}

/** 미리보기 임시본 삭제(모달 취소/확정 후). 실패해도 무시. */
export function cleanupClipProxy(jobId: string): Promise<{ ok?: boolean }> {
  return ytPostJson<{ ok?: boolean }>(`/api/jobs/${jobId}/clip-proxy/cleanup`, {});
}

/** 카드 B: 한 줄의 영상 자산을 삭제하고 AI 대기 상태로 되돌린다(대본이 길어져 조각이 짧아졌을 때). */
export function clearLineClip(
  jobId: string,
  lineIndex: number,
  lineId: string,
): Promise<{ ok?: boolean; asset_version?: number | null }> {
  return ytPostJson<{ ok?: boolean; asset_version?: number | null }>(
    `/api/jobs/${jobId}/clear-line-clip`,
    { line_index: lineIndex, line_id: lineId },
  );
}

export interface RegenerateClipResult {
  message?: string;
  task_id?: string;
  already_running?: boolean;
}
/**
 * 준비된 이미지(소스 'ai'/'image')를 AI 로 움직이는 영상으로 변환. **비동기**(작업 큐, fal.ai) —
 * 호출 직후 그 줄 status='pending'(asset_action='ai_clip')이 되고, 워커가 끝나면 'ready'(소스 'clip')
 * 또는 'failed' 로 바뀐다. 호출 측은 draft-state 를 폴링해 상태 변화를 추적한다. fal.ai 키가 없으면
 * 그 줄이 'failed' + fail_reason 으로 돌아온다. 클립이 이미 있는 줄(소스 'clip')에는 호출하지 말 것.
 */
export function regenerateClip(
  jobId: string,
  lineIndex: number,
): Promise<RegenerateClipResult> {
  return ytPostJson<RegenerateClipResult>(
    `/api/jobs/${jobId}/regenerate-clip/${lineIndex}`,
    {},
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
/** 쪼갠 대본으로 Card B draft job 생성(generation_mode=user_assets, status=preview_ready).
 * 제목(2줄)도 함께 보내 중단한 draft 를 작업이력에서 다시 열 때 제목이 복원되게 한다. */
export function createDraft(
  lines: string[],
  titleLine1 = "",
  titleLine2 = "",
  titleFont?: string,
  titleFontWeight?: string,
  titleFontSize?: number,
  titleColor1?: string,
  titleColor2?: string,
): Promise<DraftJobResponse> {
  return ytPostJson<DraftJobResponse>("/api/jobs/draft", {
    lines,
    title_line1: titleLine1,
    title_line2: titleLine2,
    title_font: titleFont,
    title_font_weight: titleFontWeight,
    title_font_size: titleFontSize,
    title_color1: titleColor1,
    title_color2: titleColor2,
  });
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
  title_font?: string | null;
  title_font_weight?: string | null;
  title_font_size?: number | null;
  title_color1?: string | null;
  title_color2?: string | null;
  title_dx?: number | null;
  title_dy?: number | null;
  subtitle_font?: string | null;
  subtitle_font_weight?: string | null;
  subtitle_font_size?: number | null;
  subtitle_color?: string | null;
  subtitle_dx?: number | null;
  subtitle_y?: number | null;
  motion_speed?: number | null; // 줌(모션) 속도 — 작업 전역, 초당 확대 비율
  // 작업 다시 열기 복원용 음성/BGM 설정(백엔드 DraftStateResponse 제공).
  tts_engine?: string | null;
  voice_id?: string | null;
  emotion?: string | null;
  tts_speed?: number | null;
  tts_session_id?: string | null;
  bgm_filename?: string | null;
  bgm_volume?: number | null; // 0~0.5
  bgm_start_sec?: number | null;
  lines: ScriptLine[];
  line_sources: LineSource[];
  [key: string]: unknown;
}
export function getDraftState(jobId: string): Promise<DraftState> {
  return ytGetJson<DraftState>(`/api/jobs/${jobId}/draft-state`);
}

/**
 * Card B(user_assets) 전용: 제목(2줄)·자막 스타일을 고치고 되돌아갈 때 draft 에 즉시 저장.
 * 줄별 자산·대본은 건드리지 않는다. preview_ready 단계에서만 동작(백엔드 가드).
 * confirm 없이 앱을 닫아도 바뀐 값이 작업이력/최종 영상에 남게 한다.
 */
export function saveDraftMeta(
  jobId: string,
  meta: {
    title?: string;
    title_line1?: string;
    title_line2?: string;
    title_font?: string;
    title_font_weight?: string;
    title_font_size?: number;
    title_color1?: string;
    title_color2?: string;
    title_dx?: number;
    title_dy?: number;
    subtitle_font?: string;
    subtitle_font_weight?: string;
    subtitle_font_size?: number;
    subtitle_color?: string;
    subtitle_dx?: number;
    subtitle_y?: number;
    motion_speed?: number;
  },
): Promise<DraftState> {
  return ytPostJson<DraftState>(`/api/jobs/${jobId}/draft-meta`, meta);
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

// ── Card B 줄 구조 편집 (M3c, 전부 job.status==preview_ready 필요) ──────
//
// 공통 주의:
//  · 4종 모두 백엔드가 ① preview_ready 가 아니면 409, ② 그 줄이 AI 생성 중이면
//    409("AI 자산 생성이 진행 중인 줄입니다") 로 거부 → 호출 측은 메시지를 그대로 안내.
//  · split/merge/delete 는 **재정렬된 전체** {lines, sources} 를 돌려준다 → 받아서 통째 교체
//    (별도 draft-state 새로고침 불필요). edit-line 만 {ok:true} (텍스트만, 재정렬 없음, 이미지 보존).
//  · index 기반이라 호출 직전 line_id 로 현재 index 를 재해석할 것. delete 는 line_id 를 함께
//    보내면 백엔드가 알아서 위치를 재확인하고, 못 찾으면 조용히 무시(레이스 안전).

/** split/merge/delete 공통 응답 — 재정렬된 전체 줄과 줄별 소스. */
export interface LineEditResult {
  lines: ScriptLine[];
  sources: LineSource[];
}

/** 줄 텍스트만 서버에 동기화. 재정렬·이미지 변화 없음. 빈 문자열 허용. */
export function editLine(
  jobId: string,
  lineIndex: number,
  text: string,
): Promise<{ ok?: boolean }> {
  return ytPostJson<{ ok?: boolean }>(`/api/jobs/${jobId}/edit-line`, {
    line_index: lineIndex,
    text,
  });
}

export interface SaveLineVisualResult {
  ok?: boolean;
  transform?: LineTransform | null; // 서버가 클램프한 최종 값
  motion?: string | null;
  clip_start?: number | null; // 서버가 클램프한 최종 시작점(초)
}
/**
 * 줄별 자산 위치/배율(transform)·움직임(motion)·영상 시작점(clipStart)을 저장. 미디어 파일은 안 바뀐다.
 * patch 에 준 필드만 갱신(미포함=미변경). line_id 를 함께 보내 재인덱싱 레이스를 피한다.
 * 영상(clip) 줄의 motion 은 'none'/'zoom_in' 만 허용, clipStart 는 영상 줄에만 유효(서버 검증).
 */
export function saveLineVisual(
  jobId: string,
  lineIndex: number,
  lineId: string | null | undefined,
  patch: { transform?: LineTransform; motion?: string; clipStart?: number },
): Promise<SaveLineVisualResult> {
  return ytPostJson<SaveLineVisualResult>(`/api/jobs/${jobId}/line-visual`, {
    line_index: lineIndex,
    line_id: lineId ?? null,
    transform: patch.transform ?? null,
    motion: patch.motion ?? null,
    clip_start: patch.clipStart ?? null,
  });
}

/**
 * 줄을 커서 위치에서 둘로 나눔. before/after 는 클라가 보낸 텍스트 그대로 적용.
 * 끝에서 Enter(after="") → 아래에 빈 AI줄, 맨앞에서 Enter(before="") → 위에 빈 AI줄,
 * 가운데 → 첫 줄은 line_id·이미지·자산 보존(텍스트만 before), 둘째 줄은 새 AI줄(after).
 * 응답으로 재정렬된 전체 줄/소스를 돌려준다.
 */
export function splitLine(
  jobId: string,
  lineIndex: number,
  before: string,
  after: string,
): Promise<LineEditResult> {
  return ytPostJson<LineEditResult>(`/api/jobs/${jobId}/split-line`, {
    line_index: lineIndex,
    before,
    after,
  });
}

/**
 * lineIndex 줄을 바로 위(lineIndex-1) 줄 끝에 이어 붙이고 그 줄을 제거. lineIndex≥1.
 * 위 줄의 line_id·이미지·자산은 보존, 사라지는 줄의 자산만 정리(이미지 보존 정책과 일관).
 * 서버가 두 줄의 **서버 텍스트**를 이어 붙이므로, 미저장 편집은 호출 전 edit-line 으로 반영할 것.
 */
export function mergeLine(
  jobId: string,
  lineIndex: number,
): Promise<LineEditResult> {
  return ytPostJson<LineEditResult>(`/api/jobs/${jobId}/merge-line`, {
    line_index: lineIndex,
  });
}

/**
 * 줄 삭제. line_id 를 함께 보내면 백엔드가 현재 위치를 재확인(레이스 안전, 못 찾으면 무시).
 * 마지막 한 줄은 삭제 불가(400). 응답으로 재정렬된 전체 줄/소스를 돌려준다.
 */
export function deleteLine(
  jobId: string,
  lineIndex: number,
  lineId?: string | null,
): Promise<LineEditResult> {
  return ytPostJson<LineEditResult>(`/api/jobs/${jobId}/delete-line`, {
    line_index: lineIndex,
    line_id: lineId ?? null,
  });
}

// ── 작업이력 (목록 / 다시 열기 / 삭제) ──────────

/** 작업이력 카드 1건. 백엔드 JobResponse 의 목록용 부분집합. */
export interface JobSummary {
  job_id: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  video_url?: string | null;
  can_reopen: boolean;
  generation_mode?: string | null;
  title?: string | null;
  title_line1?: string | null;
  title_line2?: string | null;
  size_bytes?: number | null;
  error?: string | null;
}

/** 본인 작업 이력(최신순). 목록 응답엔 size_bytes·title 이 채워져 있다. */
export function listJobs(limit = 30): Promise<JobSummary[]> {
  return ytGetJson<JobSummary[]>(`/api/jobs/?limit=${limit}`);
}

/** 완료/실패/편집중 Card B 작업을 편집 상태(preview_ready)로 되돌리고 복원 데이터(draft-state) 반환.
 * (failed: 렌더 실패 후 자산 교체용 재진입) 진행 중(active task)이면 409, 정리/만료됐으면 410. */
export function reopenJob(jobId: string): Promise<DraftState> {
  return ytPostJson<DraftState>(`/api/jobs/${jobId}/reopen`, {});
}

/** 작업의 모든 산출물 삭제(작업이력 "삭제"). 진행 중이면 409. 멱등. */
export function discardJob(jobId: string): Promise<{ ok: boolean }> {
  return ytPostJson<{ ok: boolean }>(`/api/jobs/${jobId}/discard`, {});
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
