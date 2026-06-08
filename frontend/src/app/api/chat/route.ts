// 고객 지원 챗봇 라우트 — 지식 베이스(knowledge.ts)를 시스템 프롬프트로 고정하고
// Gemini 로 답변을 스트리밍한다. 기존 글 생성 라우트와 동일한 text/plain chunked 패턴.

import { generateChatStream, type ChatTurn } from "@/lib/gemini";
import { buildSystemPrompt } from "@/lib/chatbot/knowledge";
import { CONFIG } from "@/lib/config";

export const maxDuration = 60;

/** 클라이언트가 보내는 메시지 한 건. */
interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 12; // 직전 대화 최대 보존 턴 수 (토큰 절약)
const MAX_LEN = 2000; // 메시지 한 건 최대 길이 (남용 방지)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: IncomingMessage[];
      apiKey?: string;
      currentPage?: string;
    };

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];

    // 정제: 빈 내용 제거 + 길이 컷 + 최근 MAX_TURNS 턴만 유지.
    const history: ChatTurn[] = rawMessages
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_TURNS)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        text: m.content.trim().slice(0, MAX_LEN),
      }));

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      return Response.json(
        { error: "사용자 메시지가 비어 있습니다." },
        { status: 400 }
      );
    }

    const currentPage =
      typeof body.currentPage === "string" ? body.currentPage : undefined;
    const systemInstruction = buildSystemPrompt(currentPage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateChatStream(
            systemInstruction,
            history,
            CONFIG.GENERATION_MODEL,
            body.apiKey
          )) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // 키 미설정 등은 사용자에게 보이는 안내로 변환해 흘려보낸다.
          const friendly = /API 키/.test(msg)
            ? "\n\n⚠️ Gemini API 키가 설정되어 있지 않습니다. 상단 열쇠 아이콘에서 키를 먼저 등록해주세요."
            : "\n\n⚠️ 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
          controller.enqueue(encoder.encode(friendly));
        } finally {
          controller.close();
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
      error instanceof Error ? error.message : "챗봇 응답 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
