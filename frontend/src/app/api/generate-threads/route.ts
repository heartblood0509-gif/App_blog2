import { generateStream } from "@/lib/gemini";
import {
  buildThreadsFromAnalysisPrompt,
  buildThreadsFromBlogPrompt,
  buildThreadsFromNewsPrompt,
} from "@/lib/prompts/threads";
import {
  rateLimit,
  getClientId,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(request: Request) {
  const { success } = rateLimit(getClientId(request), 10, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const body = await request.json();
    const { mode, text, analysis, topic, requirements, blogContent, apiKey } =
      body as {
        mode?: string;
        text?: string;
        analysis?: string;
        topic?: string;
        requirements?: string;
        blogContent?: string;
        apiKey?: string;
      };

    if (mode !== "article" && mode !== "analysis" && mode !== "blog") {
      return Response.json(
        { error: "mode가 잘못되었습니다 (article, analysis, blog 중 하나)." },
        { status: 400 }
      );
    }

    let prompt: string;
    if (mode === "analysis") {
      if (typeof analysis !== "string" || analysis.length === 0) {
        return Response.json(
          { error: "분석 결과가 필요합니다." },
          { status: 400 }
        );
      }
      if (typeof topic !== "string" || topic.trim().length === 0) {
        return Response.json(
          { error: "주제를 입력해주세요." },
          { status: 400 }
        );
      }
      prompt = buildThreadsFromAnalysisPrompt(
        analysis,
        topic,
        requirements && typeof requirements === "string"
          ? requirements
          : undefined
      );
    } else if (mode === "blog") {
      if (typeof blogContent !== "string" || blogContent.trim().length < 200) {
        return Response.json(
          { error: "블로그 본문이 너무 짧습니다 (최소 200자)." },
          { status: 400 }
        );
      }
      prompt = buildThreadsFromBlogPrompt(
        blogContent,
        requirements && typeof requirements === "string"
          ? requirements
          : undefined
      );
    } else {
      if (typeof text !== "string" || text.length < 50) {
        return Response.json(
          { error: "기사 텍스트가 너무 짧습니다 (최소 50자)." },
          { status: 400 }
        );
      }
      prompt = buildThreadsFromNewsPrompt(
        text,
        requirements && typeof requirements === "string"
          ? requirements
          : undefined
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateStream(
            prompt,
            "gemini-2.5-flash",
            apiKey
          )) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "쓰레드 생성 중 오류";
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
