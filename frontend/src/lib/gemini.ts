import { GoogleGenAI } from "@google/genai";

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
