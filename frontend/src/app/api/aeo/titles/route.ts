/**
 * AEO 제목 생성 API.
 *
 * - 입력: profile, template, mainKeyword, subKeywords, topic, count, apiKey
 * - 출력: { suggestions: [{ title, type }, ...] } JSON
 */
import { buildAeoTitlePrompt } from "@/lib/aeo/prompts/title";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { AeoProfile, AeoTemplateId } from "@/types/aeo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      template,
      mainKeyword,
      subKeywords,
      topic,
      count,
      apiKey,
    } = body as {
      profile: AeoProfile;
      template: AeoTemplateId;
      mainKeyword: string;
      subKeywords?: string;
      topic?: string | null;
      count?: number;
      apiKey?: string;
    };

    if (!profile || !template || !mainKeyword) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, template, mainKeyword)." },
        { status: 400 }
      );
    }

    const prompt = buildAeoTitlePrompt({
      profile,
      template,
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

    const suggestions = JSON.parse(jsonStr);
    return Response.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AEO 제목 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
