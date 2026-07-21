// 호출처는 계속 Gemini 모델 문자열(CONFIG.* 또는 라우트에 하드코딩된 값)을 넘긴다.
// OpenAI 모드일 때 그 문자열을 "역할"로 환원해 실제 OpenAI 모델/이미지 크기를 고른다.

import type { AiRole } from "./types";

// Gemini 모델 문자열 → 역할. 하드코딩된 모델명(analyze-threads-image 등)까지 커버한다.
const GEMINI_MODEL_TO_ROLE: Record<string, AiRole> = {
  "gemini-3.5-flash": "generation",
  "gemini-3.1-flash-lite": "generation",
  "gemini-3.1-flash-image": "image",
  "gemini-3-pro-image": "imagePro",
};

/** 모델 문자열을 역할로 환원. 미지의 문자열은 generation 으로 안전 폴백. */
export function roleFromModel(model: string): AiRole {
  return GEMINI_MODEL_TO_ROLE[model] ?? "generation";
}

// aspectRatio → gpt-image-2 size. gpt-image-2 는 정사각/세로/가로 3종을 표준 지원한다.
const ASPECT_TO_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "9:16": "1024x1536",
  "3:4": "1024x1536",
  "2:3": "1024x1536",
  "4:5": "1024x1536",
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "3:2": "1536x1024",
};

/** aspectRatio 문자열을 gpt-image-2 size 로 매핑. 미지원 비율은 정사각 폴백. */
export function aspectToSize(aspectRatio: string): string {
  return ASPECT_TO_SIZE[aspectRatio] ?? "1024x1024";
}
