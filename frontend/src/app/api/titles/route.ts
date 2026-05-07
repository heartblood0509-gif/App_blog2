import { buildTitlePrompt } from "@/lib/prompts/title";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { NarrativeType, ProductInfo, ToneType, SelectedProduct } from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      products,
      narrativeType,
      toneType,
      mainKeyword,
      subKeywords,
      persona,
      topic,
      customProductInfoById,
      apiKey,
    } = body as {
      products: SelectedProduct[];
      narrativeType: NarrativeType;
      toneType: ToneType;
      mainKeyword: string;
      subKeywords?: string;
      persona?: string;
      topic?: string;
      customProductInfoById?: Record<string, ProductInfo>;
      apiKey?: string;
    };

    const prompt = buildTitlePrompt({
      products,
      narrativeType,
      toneType,
      mainKeyword,
      subKeywords,
      persona,
      topic,
      customProductInfoById,
    });

    const result = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);

    // JSON 파싱 (마크다운 코드블록 감싸기 처리)
    let jsonStr = result.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const suggestions = JSON.parse(jsonStr);
    return Response.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "제목 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
