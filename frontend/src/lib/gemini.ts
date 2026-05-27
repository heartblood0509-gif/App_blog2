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
 * Gemini 공식 가이드 기반:
 *  - imageConfig 로 aspectRatio/imageSize 강제
 *  - thinkingConfig high 로 다중 제약 프롬프트 처리 향상
 *  - 같은 원본 이미지를 N번 반복 전송하여 인물 정체성 강화
 *
 * @param referenceCount 원본 이미지를 몇 번 반복해 넣을지 (1~4, 2 권장)
 */
export async function transformImage(
  prompt: string,
  userImageBase64: string,
  userImageMime: string,
  model: string,
  apiKey?: string,
  referenceCount: number = 1
): Promise<GeneratedImageResult | null> {
  try {
    const ai = await getGenAI(apiKey);

    // parts 배열 구성: [text, image, image, ...]
    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [{ text: prompt }];
    const repeat = Math.max(1, Math.min(4, referenceCount));
    for (let i = 0; i < repeat; i++) {
      parts.push({
        inlineData: { data: userImageBase64, mimeType: userImageMime },
      });
    }

    // SDK 타입에 imageConfig/thinkingConfig 가 아직 반영되지 않았을 수 있어 any 캐스팅
    const config = {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "2K",
      },
      thinkingConfig: {
        thinkingLevel: "high",
      },
    } as unknown as Parameters<typeof ai.models.generateContent>[0]["config"];

    const resp = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
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
