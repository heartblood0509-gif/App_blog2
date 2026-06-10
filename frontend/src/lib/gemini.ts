// AI 제공자 파사드. 기존 export 시그니처를 100% 보존하고, 활성 provider(gemini|openai)에
// 따라 내부 구현(lib/ai/gemini-provider | openai-provider)에 위임한다.
// 호출처(약 20개 라우트)는 한 줄도 바뀌지 않는다.
//
// 타입은 lib/ai/types 로 이동했고 여기서 그대로 re-export 한다(기존 import 경로 불변).
// provider 는 resolveProviderConfig 로 해석 — 요청 스냅샷(withProviderSnapshot)이 있으면 그 값.

import { resolveProviderConfig } from "./ai/provider-context";
import * as gemini from "./ai/gemini-provider";
import * as openai from "./ai/openai-provider";
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

async function isOpenAIActive(): Promise<boolean> {
  const { provider } = await resolveProviderConfig();
  return provider === "openai";
}

/**
 * 텍스트 생성 (스트리밍)
 */
export async function* generateStream(
  prompt: string,
  model: string = "gemini-2.5-flash",
  apiKey?: string
): AsyncGenerator<string> {
  if (await isOpenAIActive()) {
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
  model: string = "gemini-2.5-flash",
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
  model: string = "gemini-2.5-flash",
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
  model: string = "gemini-2.5-flash",
  apiKey?: string,
  generationConfig?: GenerateTextConfig
): Promise<string> {
  if (await isOpenAIActive()) {
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
  if (await isOpenAIActive()) {
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
  if (await isOpenAIActive()) {
    return openai.generateImage(prompt, model, apiKey);
  }
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
  if (await isOpenAIActive()) {
    return openai.generateImageWithAspect(prompt, aspectRatio, model, apiKey);
  }
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
  if (await isOpenAIActive()) {
    return openai.transformImage(prompt, userImageBase64, userImageMime, model, apiKey);
  }
  return gemini.transformImage(prompt, userImageBase64, userImageMime, model, apiKey);
}
