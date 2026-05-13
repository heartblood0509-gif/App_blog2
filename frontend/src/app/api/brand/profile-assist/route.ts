/**
 * 브랜드 프로필 자동 등록 도우미 API.
 *
 * - 입력: { freeformInput, apiKey? }
 * - 출력: BrandProfile 필드 + missingFields 배열 JSON
 *
 * AEO의 /api/aeo/profile-assist 와 동일 패턴 (의도적 복제).
 */
import { buildBrandProfileAssistPrompt } from "@/lib/brand/prompts/profile-assist";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { freeformInput, apiKey } = body as {
      freeformInput: string;
      apiKey?: string;
    };

    if (!freeformInput || freeformInput.trim().length < 10) {
      return Response.json(
        { error: "브랜드 자기소개를 최소 10자 이상 입력해주세요." },
        { status: 400 }
      );
    }

    const prompt = buildBrandProfileAssistPrompt({ freeformInput });
    const raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);

    // JSON 추출 (코드블록 둘러쌌을 수도 있음)
    let jsonStr = raw.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    // 첫 { ~ 마지막 } 만 추출 (안전 폴백)
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }

    const parsed = JSON.parse(jsonStr);
    return Response.json(parsed);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "브랜드 프로필 도우미 호출 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
