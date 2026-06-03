"use client";

// 유튜브 백엔드 API 의 타입드 래퍼. 필드명은 백엔드 계약(api/routes/*)과 1:1 일치해야 한다.
// 모든 호출은 same-origin 프록시(/api/youtube)를 경유한다.

import { ytPostJson } from "./api";

// ── 콘텐츠 생성 ──────────────────────────────────────────────

export interface GenerateTitlesInput {
  topic: string;
  category: string;
  pain_point: string;
  ingredient: string;
  content_type: string;
  keyword: string;
}
export interface GenerateTitlesResult {
  titles: string[];
}
export function generateTitles(
  input: GenerateTitlesInput,
): Promise<GenerateTitlesResult> {
  return ytPostJson<GenerateTitlesResult>("/api/generate/titles", input);
}
