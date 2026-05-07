/**
 * 브랜드 제목 생성 API.
 *
 * - 입력: profile, template, infoVariantId, mainKeyword, subKeywords, topic, count, apiKey
 * - 출력: { suggestions: [{ title, type }, ...] } JSON
 */
import { buildBrandTitlePrompt } from "@/lib/brand/prompts/title";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  BrandProposition,
} from "@/types/brand";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      template,
      infoVariantId,
      mainKeyword,
      subKeywords,
      topic,
      count,
      apiKey,
      propositions,
    } = body as {
      profile: BrandProfile;
      template: BrandTemplateId;
      infoVariantId?: BrandInfoVariantId | null;
      mainKeyword: string;
      subKeywords?: string;
      topic?: string | null;
      count?: number;
      apiKey?: string;
      propositions?: BrandProposition[];
    };

    if (!profile || !template || !mainKeyword) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, template, mainKeyword)." },
        { status: 400 }
      );
    }

    // 정보성글(활성 변형) 제목 생성도 propositions 필수 — 본문과 톤 일관성
    if (
      template === "info" &&
      (infoVariantId === "info-5" || infoVariantId === "info-custom") &&
      (!propositions || propositions.length === 0)
    ) {
      return Response.json(
        { error: "정보성글 제목 생성에는 propositions가 필요합니다. distill API를 먼저 호출하세요." },
        { status: 400 }
      );
    }

    const prompt = buildBrandTitlePrompt({
      profile,
      template,
      infoVariantId,
      mainKeyword,
      subKeywords,
      topic,
      count: count ?? 5,
      propositions,
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
      error instanceof Error ? error.message : "브랜드 제목 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
