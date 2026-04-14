import { buildFixPrompt } from "@/lib/prompts/fix";
import { generateStream } from "@/lib/gemini";
import { autoReplaceForbiddenWords } from "@/lib/quality/forbidden-words";
import { CONFIG } from "@/lib/config";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { content, failReasons, keyword, apiKey } = await request.json();

    if (!content || !failReasons || !keyword) {
      return Response.json(
        { error: "content, failReasons, keyword가 필요합니다." },
        { status: 400 }
      );
    }

    // 1단계: 금지어 코드 치환 (AI 불필요)
    let fixedContent = autoReplaceForbiddenWords(content);

    // 금지어만 문제였으면 AI 호출 없이 바로 반환
    const nonForbiddenReasons = (failReasons as string[]).filter(
      (r: string) => !r.includes("금지어")
    );

    if (nonForbiddenReasons.length === 0) {
      return new Response(fixedContent, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2단계: 나머지 문제는 AI에게 수정 요청
    const prompt = buildFixPrompt({
      content: fixedContent,
      failReasons: nonForbiddenReasons,
      keyword,
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
      error instanceof Error ? error.message : "품질 수정 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
