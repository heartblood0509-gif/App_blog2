/**
 * AEO 타겟 자연어 질문 추론 API.
 *
 * - 입력: profile, mainKeyword, subKeywords?, topic?, count?, apiKey?
 * - 출력: { queries: string[] } JSON
 */
import { buildInferQueriesPrompt } from "@/lib/aeo/prompts/infer-queries";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { AeoProfile } from "@/types/aeo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      mainKeyword,
      subKeywords,
      topic,
      count,
      apiKey,
    } = body as {
      profile: AeoProfile;
      mainKeyword: string;
      subKeywords?: string;
      topic?: string | null;
      count?: number;
      apiKey?: string;
    };

    if (!profile || !mainKeyword) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, mainKeyword)." },
        { status: 400 }
      );
    }

    const prompt = buildInferQueriesPrompt({
      profile,
      mainKeyword,
      subKeywords,
      topic,
      count: count ?? 5,
    });

    const result = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);

    let jsonStr = result.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const queries = JSON.parse(jsonStr);
    if (!Array.isArray(queries) || queries.some((q) => typeof q !== "string")) {
      throw new Error("응답 형식이 잘못되었습니다. (string 배열 필요)");
    }

    return Response.json({ queries });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "타겟 질문 추론 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
