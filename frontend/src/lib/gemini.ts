// AI 제공자 파사드. 기존 export 시그니처를 100% 보존하고, 활성 provider(gemini|openai)에
// 따라 내부 구현(lib/ai/gemini-provider | openai-provider)에 위임한다.
// 호출처(약 20개 라우트)는 한 줄도 바뀌지 않는다.
//
// 타입은 lib/ai/types 로 이동했고 여기서 그대로 re-export 한다(기존 import 경로 불변).
// provider 는 resolveProviderConfig 로 해석 — 요청 스냅샷(withProviderSnapshot)이 있으면 그 값.

import { resolveProviderConfig } from "./ai/provider-context";
import { effectiveImageProvider } from "./server/ai-provider";
import { isFalImageAvailable } from "./server/fal-key";
import { devLog } from "./ai/log";
import * as gemini from "./ai/gemini-provider";
import * as openai from "./ai/openai-provider";
import * as fal from "./ai/fal-provider";
import type {
  ChatTurn,
  MultimodalTurn,
  GenerateTextConfig,
  GeneratedImageResult,
} from "./ai/types";

export type {
  ChatTurn,
  ChatPart,
  MultimodalTurn,
  GenerateTextConfig,
  GeneratedImageResult,
} from "./ai/types";

// 텍스트 축(글·제목·분석·describeImageSubject) — provider 설정을 따른다.
async function isOpenAIActive(): Promise<boolean> {
  const { provider } = await resolveProviderConfig();
  return provider === "openai";
}

// 이미지 축 — imageProvider(미설정 시 provider) + fal 키 유무로 백엔드 결정.
//   openai            → gpt-image-2
//   gemini + fal 키   → fal (nano-banana, 같은 Gemini 모델·429 회피)
//   gemini + 키 없음  → Gemini 직접
// 런타임 자동 우회 없음(결정 5): fal 이 골라지면 실패해도 Gemini 로 재시도하지 않는다.
async function resolveImageBackend(): Promise<"openai" | "fal" | "gemini"> {
  const cfg = await resolveProviderConfig();
  const imageProvider = effectiveImageProvider(cfg);
  if (imageProvider === "openai") {
    devLog("[image-backend]", { imageProvider, chosen: "openai" });
    return "openai";
  }
  const hasFalKey = await isFalImageAvailable();
  const chosen = hasFalKey ? "fal" : "gemini";
  devLog("[image-backend]", { imageProvider, hasFalKey, chosen });
  return chosen;
}

/**
 * 텍스트 생성 (스트리밍)
 */
export async function* generateStream(
  prompt: string,
  model: string = "gemini-3.5-flash",
  apiKey?: string
): AsyncGenerator<string> {
  const openaiActive = await isOpenAIActive();
  devLog("[ai-text]", { fn: "generateStream", provider: openaiActive ? "openai" : "gemini" });
  if (openaiActive) {
    yield* openai.generateStream(prompt, model, apiKey);
    return;
  }
  yield* gemini.generateStream(prompt, model, apiKey);
}

/**
 * 멀티턴 대화를 시스템 프롬프트와 함께 스트리밍 생성 (챗봇용).
 */
export async function* generateChatStream(
  systemInstruction: string,
  history: ChatTurn[],
  model: string = "gemini-3.5-flash",
  apiKey?: string
): AsyncGenerator<string> {
  if (await isOpenAIActive()) {
    yield* openai.generateChatStream(systemInstruction, history, model, apiKey);
    return;
  }
  yield* gemini.generateChatStream(systemInstruction, history, model, apiKey);
}

/**
 * 이미지 첨부를 포함할 수 있는 멀티턴 대화를 스트리밍 생성 (챗봇 + 스크린샷).
 */
export async function* generateMultimodalChatStream(
  systemInstruction: string,
  history: MultimodalTurn[],
  model: string = "gemini-3.5-flash",
  apiKey?: string
): AsyncGenerator<string> {
  if (await isOpenAIActive()) {
    yield* openai.generateMultimodalChatStream(systemInstruction, history, model, apiKey);
    return;
  }
  yield* gemini.generateMultimodalChatStream(systemInstruction, history, model, apiKey);
}

/**
 * 텍스트 생성 (일괄)
 */
export async function generateText(
  prompt: string,
  model: string = "gemini-3.5-flash",
  apiKey?: string,
  generationConfig?: GenerateTextConfig
): Promise<string> {
  const openaiActive = await isOpenAIActive();
  devLog("[ai-text]", { fn: "generateText", provider: openaiActive ? "openai" : "gemini" });
  if (openaiActive) {
    return openai.generateText(prompt, model, apiKey, generationConfig);
  }
  return gemini.generateText(prompt, model, apiKey, generationConfig);
}

/**
 * 멀티모달(텍스트 + 이미지) 입력을 받아 텍스트를 스트리밍 생성.
 */
export async function* generateMultimodalStream(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  model: string,
  apiKey?: string
): AsyncGenerator<string> {
  if (await isOpenAIActive()) {
    yield* openai.generateMultimodalStream(parts, model, apiKey);
    return;
  }
  yield* gemini.generateMultimodalStream(parts, model, apiKey);
}

/**
 * 멀티모달(텍스트 + 이미지) 입력을 받아 텍스트를 한 번에 생성 (비스트리밍).
 */
export async function generateMultimodalText(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  model: string,
  apiKey?: string
): Promise<string> {
  if (await isOpenAIActive()) {
    return openai.generateMultimodalText(parts, model, apiKey);
  }
  return gemini.generateMultimodalText(parts, model, apiKey);
}

/**
 * 업로드한 사진의 "주된 피사체"를 한 줄로 식별 (AI 변환 프리패스).
 */
export async function describeImageSubject(
  userImageBase64: string,
  userImageMime: string,
  prompt: string,
  model: string,
  apiKey?: string
): Promise<string> {
  const openaiActive = await isOpenAIActive();
  devLog("[ai-text]", { fn: "describeImageSubject", provider: openaiActive ? "openai" : "gemini" });
  if (openaiActive) {
    return openai.describeImageSubject(userImageBase64, userImageMime, prompt, model, apiKey);
  }
  return gemini.describeImageSubject(userImageBase64, userImageMime, prompt, model, apiKey);
}

/**
 * 텍스트 프롬프트로 이미지 1장 생성. 실패/차단 시 null.
 */
export async function generateImage(
  prompt: string,
  model: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  const backend = await resolveImageBackend();
  if (backend === "openai") return openai.generateImage(prompt, model, apiKey);
  // fal 은 서버 fal 키를 직접 읽으므로 apiKey(=Gemini 키)를 넘기지 않는다.
  if (backend === "fal") return fal.generateImage(prompt, model);
  return gemini.generateImage(prompt, model, apiKey);
}

/**
 * aspectRatio 를 지정해 이미지 1장 생성.
 */
export async function generateImageWithAspect(
  prompt: string,
  aspectRatio: string,
  model: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  const backend = await resolveImageBackend();
  if (backend === "openai")
    return openai.generateImageWithAspect(prompt, aspectRatio, model, apiKey);
  if (backend === "fal")
    return fal.generateImageWithAspect(prompt, aspectRatio, model);
  return gemini.generateImageWithAspect(prompt, aspectRatio, model, apiKey);
}

/**
 * 사용자 이미지 + 텍스트 지시로 변형된 이미지 1장 생성 (image-to-image).
 */
export async function transformImage(
  prompt: string,
  userImageBase64: string,
  userImageMime: string,
  model: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  const backend = await resolveImageBackend();
  if (backend === "openai")
    return openai.transformImage(prompt, userImageBase64, userImageMime, model, apiKey);
  if (backend === "fal")
    return fal.transformImage(prompt, userImageBase64, userImageMime, model);
  return gemini.transformImage(prompt, userImageBase64, userImageMime, model, apiKey);
}
