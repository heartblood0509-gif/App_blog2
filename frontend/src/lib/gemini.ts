import { GoogleGenAI, Modality } from "@google/genai";

let genaiInstance: GoogleGenAI | null = null;

function getGenAI(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("Gemini API 키가 설정되지 않았습니다.");
  if (!genaiInstance) {
    genaiInstance = new GoogleGenAI({ apiKey: key });
  }
  return genaiInstance;
}

/**
 * Gemini로 텍스트 생성 (스트리밍)
 */
export async function* generateStream(
  prompt: string,
  model: string = "gemini-2.5-flash",
  apiKey?: string
): AsyncGenerator<string> {
  const ai = getGenAI(apiKey);
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
 * Gemini로 텍스트 생성 (일괄)
 */
export async function generateText(
  prompt: string,
  model: string = "gemini-2.5-flash",
  apiKey?: string
): Promise<string> {
  const ai = getGenAI(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });
  return response.text || "";
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
    const ai = getGenAI(apiKey);
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
    const ai = getGenAI(apiKey);

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
