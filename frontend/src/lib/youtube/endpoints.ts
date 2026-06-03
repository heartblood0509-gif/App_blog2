"use client";

// 유튜브 백엔드 API 의 타입드 래퍼. 필드명은 백엔드 계약(api/routes/*)과 1:1 일치해야 한다.
// 모든 호출은 same-origin 프록시(/api/youtube)를 경유한다.

import { ytGetBlob, ytGetJson, ytPostJson } from "./api";

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

export interface GenerateTitlesInput {
  topic: string;
  category: string;
  pain_point: string;
  ingredient: string;
  content_type: string;
  keyword: string;
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
  status?: string;
  asset_version?: number;
  // 그 외 백엔드 부가 필드(fail_reason/asset_* 등)는 그대로 통과.
  [key: string]: unknown;
}
export interface GenerateImagePromptsInput extends YtContentFields {
  narration_lines: string[];
  style: string; // 'realistic'
  topic: string;
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
