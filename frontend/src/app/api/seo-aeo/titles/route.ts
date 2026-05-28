/**
 * SEO·AEO 통합형 제목 생성 API.
 *
 * - 입력: profile, topic, mainKeyword, subKeywords, requirements, count, apiKey
 * - 출력: { suggestions: [{ title }, ...] } JSON
 */
import {
  buildSeoAeoTitlePrompt,
  buildSeoAeoIntentTitlePrompt,
} from "@/lib/seo-aeo/prompts/title";
import { isIntentMode } from "@/lib/seo-aeo/templates";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { AeoProfile } from "@/types/aeo";
import type { SeoAeoTemplateType } from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      topic,
      mainKeyword,
      subKeywords,
      requirements,
      count,
      apiKey,
      templateType,
    } = body as {
      profile: AeoProfile;
      topic?: string | null;
      mainKeyword: string;
      subKeywords?: string;
      requirements?: string;
      count?: number;
      apiKey?: string;
      templateType?: SeoAeoTemplateType;
    };

    if (!profile) {
      return Response.json(
        { error: "AEO 프로필이 누락되었습니다." },
        { status: 400 }
      );
    }
    if (!mainKeyword || !mainKeyword.trim()) {
      return Response.json(
        { error: "메인 키워드가 비어 있습니다." },
        { status: 400 }
      );
    }

    const effectiveTemplate: SeoAeoTemplateType = templateType ?? "auto";

    const prompt = isIntentMode(effectiveTemplate)
      ? buildSeoAeoIntentTitlePrompt({
          profile,
          topic,
          mainKeyword,
          subKeywords,
          requirements,
          count: count ?? 5,
          intent: effectiveTemplate,
        })
      : buildSeoAeoTitlePrompt({
          profile,
          topic,
          mainKeyword,
          subKeywords,
          requirements,
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
      error instanceof Error
        ? error.message
        : "SEO·AEO 제목 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
