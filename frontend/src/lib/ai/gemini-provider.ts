// Gemini(@google/genai) 제공자 구현. 기존 lib/gemini.ts 본문을 그대로 이전한 것.
// 공통 타입은 ./types 에서 가져오고, 키 해석은 getServerGeminiKey 를 재사용한다.
// 파사드(lib/gemini.ts)가 provider 분기 후 이 함수들에 위임한다.

import { GoogleGenAI, Modality } from "@google/genai";
import { getServerGeminiKey } from "@/lib/server/gemini-key";
import type {
  ChatTurn,
  MultimodalTurn,
  GenerateTextConfig,
  GeneratedImageResult,
} from "./types";

// 캐시는 키 단위로 보관. 키가 바뀌면 자동으로 새 인스턴스가 만들어진다.
// (이전엔 모듈 싱글톤이라 ApiKeyPanel 에서 키를 바꿔도 옛 키로 호출되는 버그가 있었음.)
const genaiByKey = new Map<string, GoogleGenAI>();

async function resolveKey(apiKey?: string): Promise<string> {
  if (apiKey) return apiKey;
  // 서버측 헬퍼: 로컬 비밀 파일(.gemini-key.local) → process.env.GEMINI_API_KEY 순.
  const { key } = await getServerGeminiKey();
  if (!key) throw new Error("Gemini API 키가 설정되지 않았습니다.");
  return key;
}

async function getGenAI(apiKey?: string): Promise<GoogleGenAI> {
  const key = await resolveKey(apiKey);
  let inst = genaiByKey.get(key);
  if (!inst) {
    inst = new GoogleGenAI({ apiKey: key });
    genaiByKey.set(key, inst);
  }
  return inst;
}

/**
 * Gemini로 텍스트 생성 (스트리밍)
 */
export async function* generateStream(
  prompt: string,
  model: string = "gemini-2.5-flash",
  apiKey?: string
): AsyncGenerator<string> {
  const ai = await getGenAI(apiKey);
  const response = await ai.models.generateContentStream({
    model,
    contents: prompt,
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) yield text;
  }
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
  const ai = await getGenAI(apiKey);
  const response = await ai.models.generateContentStream({
    model,
    contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    config: { systemInstruction },
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) yield text;
  }
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
  const ai = await getGenAI(apiKey);
  const response = await ai.models.generateContentStream({
    model,
    contents: history.map((t) => ({
      role: t.role,
      parts: t.parts as never,
    })),
    config: { systemInstruction },
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) yield text;
  }
}

/**
 * Gemini로 텍스트 생성 (일괄)
 */
export async function generateText(
  prompt: string,
  model: string = "gemini-2.5-flash",
  apiKey?: string,
  generationConfig?: GenerateTextConfig
): Promise<string> {
  const ai = await getGenAI(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    ...(generationConfig ? { config: generationConfig } : {}),
  });
  return response.text || "";
}

/**
 * Gemini로 멀티모달(텍스트 + 이미지) 입력을 받아 텍스트를 스트리밍 생성.
 */
export async function* generateMultimodalStream(
  parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  >,
  model: string,
  apiKey?: string
): AsyncGenerator<string> {
  const ai = await getGenAI(apiKey);
  const response = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: parts as never }],
  });
  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
  }
}

/**
 * Gemini로 멀티모달(텍스트 + 이미지) 입력을 받아 텍스트를 한 번에 생성 (비스트리밍).
 */
export async function generateMultimodalText(
  parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  >,
  model: string,
  apiKey?: string
): Promise<string> {
  const ai = await getGenAI(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: parts as never }],
  });
  return response.text || "";
}

/**
 * 업로드한 사진의 "주된 피사체"를 한 줄로 식별한다 (AI 변환 프리패스).
 * best-effort: SAFETY/빈응답/에러 시 "" 반환 — 변환 자체는 절대 막지 않는다.
 */
export async function describeImageSubject(
  userImageBase64: string,
  userImageMime: string,
  prompt: string,
  model: string,
  apiKey?: string
): Promise<string> {
  try {
    const text = await generateMultimodalText(
      [
        { inlineData: { data: userImageBase64, mimeType: userImageMime } },
        { text: prompt },
      ],
      model,
      apiKey
    );
    const oneLine = (text || "").replace(/\s+/g, " ").trim();
    return oneLine.slice(0, 100);
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// 이미지 생성/변환 (Nano Banana 2 등 Gemini 이미지 모델)
// ─────────────────────────────────────────────

/**
 * 응답의 candidates에서 이미지 파트를 찾아 추출.
 */
function extractFirstImage(resp: unknown): GeneratedImageResult | null {
  interface PartLike {
    inlineData?: { data?: string | Uint8Array; mimeType?: string };
  }
  interface CandidateLike {
    content?: { parts?: PartLike[] };
  }
  interface ResponseLike {
    candidates?: CandidateLike[];
  }
  const r = resp as ResponseLike;
  const candidates = r?.candidates;
  if (!candidates || candidates.length === 0) return null;
  for (const cand of candidates) {
    const parts = cand?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part?.inlineData;
      if (!inline) continue;
      const mime = inline.mimeType || "";
      if (!mime.startsWith("image/")) continue;
      const raw = inline.data;
      if (!raw) continue;
      const base64 =
        typeof raw === "string" ? raw : Buffer.from(raw).toString("base64");
      return { base64, mimeType: mime };
    }
  }
  return null;
}

/**
 * 텍스트 프롬프트로 이미지 1장 생성. 실패(빈 응답, SAFETY 차단 등)시 null 반환.
 */
export async function generateImage(
  prompt: string,
  model: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  try {
    const ai = await getGenAI(apiKey);
    const resp = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
    return extractFirstImage(resp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/SAFETY|safety|blocked/i.test(msg)) {
      return null;
    }
    // 네트워크/쿼터 에러는 호출자가 재시도 여부를 결정하도록 throw
    throw err;
  }
}

/**
 * aspectRatio 등 imageConfig를 명시적으로 지정해 이미지 1장을 생성.
 */
export async function generateImageWithAspect(
  prompt: string,
  aspectRatio: string,
  model: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  try {
    const ai = await getGenAI(apiKey);
    const config = {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig: { aspectRatio },
    } as unknown as Parameters<typeof ai.models.generateContent>[0]["config"];
    const resp = await ai.models.generateContent({
      model,
      contents: prompt,
      config,
    });
    return extractFirstImage(resp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/SAFETY|safety|blocked/i.test(msg)) {
      return null;
    }
    throw err;
  }
}

/**
 * 사용자 이미지 + 텍스트 지시로 변형된 이미지 1장 생성 (image-to-image).
 * 원본 비율 보존을 위해 imageConfig·thinkingConfig 는 의도적으로 지정하지 않는다.
 */
export async function transformImage(
  prompt: string,
  userImageBase64: string,
  userImageMime: string,
  model: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  try {
    const ai = await getGenAI(apiKey);

    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [
      { text: prompt },
      { inlineData: { data: userImageBase64, mimeType: userImageMime } },
    ];

    const resp = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
    return extractFirstImage(resp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/SAFETY|safety|blocked/i.test(msg)) {
      return null;
    }
    throw err;
  }
}
