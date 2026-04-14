import { buildGenerationPrompt } from "@/lib/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { NarrativeType, ToneType, SelectedProduct } from "@/types";

export const maxDuration = 60;

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
      requirements,
      charCount,
      selectedTitle,
      referenceAnalysis,
      apiKey,
    } = body as {
      products: SelectedProduct[];
      narrativeType: NarrativeType;
      toneType: ToneType;
      mainKeyword: string;
      subKeywords?: string;
      persona?: string;
      requirements?: string;
      charCount: { min: number; max: number };
      selectedTitle: string;
      referenceAnalysis?: string;
      apiKey?: string;
    };

    const prompt = buildGenerationPrompt({
      products,
      narrativeType,
      toneType,
      mainKeyword,
      subKeywords,
      persona,
      requirements,
      charCount,
      selectedTitle,
      referenceAnalysis,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateStream(prompt, CONFIG.GENERATION_MODEL, apiKey)) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "글 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
