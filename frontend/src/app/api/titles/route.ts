import { buildTitlePrompt } from "@/lib/prompts/title";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { withRetryAsync } from "@/lib/ai/with-retry";
import { geminiErrorResponse } from "@/lib/ai/retry-classify";
import { withProviderSnapshot } from "@/lib/ai/provider-context";
import type { NarrativeType, ProductInfo, ToneType, SelectedProduct } from "@/types";

export async function POST(request: Request) {
  return withProviderSnapshot(() => handlePost(request));
}

async function handlePost(request: Request): Promise<Response> {
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

    const result = await withRetryAsync(
      () => generateText(prompt, CONFIG.GENERATION_MODEL, apiKey),
      { retries: CONFIG.TEXT_TRANSIENT_RETRIES, backoffMs: CONFIG.TEXT_BACKOFF_MS }
    );

    // JSON 파싱 (마크다운 코드블록 감싸기 처리)
    let jsonStr = result.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const suggestions = JSON.parse(jsonStr);
    return Response.json({ suggestions });
  } catch (error) {
    return geminiErrorResponse(error);
  }
}
