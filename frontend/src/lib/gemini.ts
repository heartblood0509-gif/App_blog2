import { GoogleGenAI, Modality } from "@google/genai";
import { getServerGeminiKey } from "@/lib/server/gemini-key";

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

/** 챗봇 대화 한 턴 (시스템 프롬프트는 별도 전달). */
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/**
 * 멀티턴 대화를 시스템 프롬프트와 함께 스트리밍 생성 (챗봇용).
 * systemInstruction 으로 지식 베이스/역할을 고정하고, history 로 직전 대화를 잇는다.
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

/** 멀티모달 채팅용 파트 (텍스트 또는 인라인 이미지). */
export type ChatPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

/** 이미지 첨부가 가능한 챗봇 대화 한 턴. */
export interface MultimodalTurn {
  role: "user" | "model";
  parts: ChatPart[];
}

/**
 * 이미지 첨부를 포함할 수 있는 멀티턴 대화를 스트리밍 생성 (챗봇 + 스크린샷).
 * 각 턴의 parts 에 {text} 와 {inlineData}(이미지)를 섞어 넣을 수 있다.
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
 * Gemini 일괄 텍스트 생성용 선택적 설정.
 * 결정론적 출력이 필요한 변환·치환 작업에서 temperature=0 / topP / topK / responseMimeType 같은
 * 옵션을 전달하기 위해 추가 (기본 호출은 인자 생략으로 SDK 기본값 그대로 사용).
 */
export interface GenerateTextConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  responseMimeType?: string;
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
 * 쓰레드 이미지 분석 등 멀티모달 흐름에서 사용.
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
 * generateMultimodalStream 의 단발 버전.
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
 * 공식 권장대로 단일 이미지는 [이미지, 텍스트] 순서로 넣고, 텍스트(prompt)에
 * 블로그 맥락을 식별 근거로 함께 준다.
 *
 * best-effort: SAFETY/빈응답/에러 시 "" 반환 — 변환 자체는 절대 막지 않는다.
 * 결과는 첫 줄·trim·길이 캡(100자)으로 정제.
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
    // 여러 줄로 답해도 통째로 한 줄로 합친 뒤(줄바꿈·연속 공백 → 공백 1개) 100자 컷.
    // (첫 줄만 취하면 모델이 줄 단위로 나눠 답할 때 뒷부분이 잘리던 문제 방지.)
    const oneLine = (text || "").replace(/\s+/g, " ").trim();
    return oneLine.slice(0, 100);
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// 이미지 생성/변환 (Nano Banana 2 등 image-preview 모델)
// ─────────────────────────────────────────────

export interface GeneratedImageResult {
  /** base64 (data URL prefix 없음) */
  base64: string;
  /** 예: "image/png" */
  mimeType: string;
}

/**
 * 응답의 candidates에서 이미지 파트를 찾아 추출.
 */
function extractFirstImage(
  resp: unknown
): GeneratedImageResult | null {
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
        typeof raw === "string"
          ? raw
          : Buffer.from(raw).toString("base64");
      return { base64, mimeType: mime };
    }
  }
  return null;
}

/**
 * 텍스트 프롬프트로 이미지 1장 생성.
 * 실패(빈 응답, SAFETY 차단 등)시 null 반환.
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
 * 쓰레드 이미지 생성에서 4:5/16:9 등 비율 강제에 사용.
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
 * 원본을 거의 그대로 살리는 게 목적이라, 비율 강제(imageConfig)·고강도 추론(thinkingConfig)은
 * 의도적으로 지정하지 않는다 — imageConfig 미지정 시 모델이 입력 비율을 추종(원본 비율 보존),
 * thinking 미지정 시 과한 재해석을 줄인다.
 *
 * 원본 사진은 정확히 1장만 넣는다. (구글의 멀티 reference 기능은 '서로 다른 각도/뷰'를
 * 합성·일관성에 쓰는 것이라, 동일 이미지 중복은 공식적 이점이 없어 제거함.)
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

    // parts 배열: [text, image] — 원본 1장만.
    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [
      { text: prompt },
      { inlineData: { data: userImageBase64, mimeType: userImageMime } },
    ];

    // 원본 비율 보존을 위해 imageConfig(aspectRatio/imageSize)·thinkingConfig는
    // 의도적으로 지정하지 않는다. AI 변환은 원본을 거의 그대로 살리는 것이 목적.
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
