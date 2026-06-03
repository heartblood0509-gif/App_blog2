"use client";

// 유튜브 백엔드 API 의 타입드 래퍼. 필드명은 백엔드 계약(api/routes/*)과 1:1 일치해야 한다.
// 모든 호출은 same-origin 프록시(/api/youtube)를 경유한다.

import { ytPostJson } from "./api";

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
