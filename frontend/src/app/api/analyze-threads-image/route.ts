import { generateMultimodalStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { buildThreadsImageAnalysisPrompt } from "@/lib/prompts/threads";
import {
  rateLimit,
  getClientId,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const maxDuration = 120;

interface IncomingImage {
  data: string;
  mimeType?: string;
}

export async function POST(request: Request) {
  const { success } = rateLimit(getClientId(request), 10, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const body = await request.json();
    const { images, apiKey } = body as {
      images?: IncomingImage[];
      apiKey?: string;
    };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return Response.json(
        { error: "이미지를 1장 이상 업로드해주세요." },
        { status: 400 }
      );
    }

    const prompt = buildThreadsImageAnalysisPrompt();
    const parts: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    > = [{ text: prompt }];

    for (const img of images) {
      let base64Data: string;
      let mimeType: string;

      if (img.data.includes(",")) {
        const match = img.data.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        } else {
          base64Data = img.data.split(",")[1];
          mimeType = img.mimeType || "image/png";
        }
      } else {
        base64Data = img.data;
        mimeType = img.mimeType || "image/png";
      }

      parts.push({ inlineData: { mimeType, data: base64Data } });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateMultimodalStream(
            parts,
            CONFIG.ANALYSIS_MODEL,
            apiKey
          )) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "이미지 분석 중 오류";
          controller.enqueue(
            new TextEncoder().encode(`\n\n[오류] ${msg}`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "요청 처리 중 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
