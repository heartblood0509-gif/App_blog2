// 고객 지원 챗봇 라우트 — 지식 베이스(knowledge.ts)를 시스템 프롬프트로 고정하고
// Gemini 로 답변을 스트리밍한다. 텍스트 + 이미지(스크린샷) 멀티모달 입력 지원.

import {
  generateMultimodalChatStream,
  type ChatPart,
  type MultimodalTurn,
} from "@/lib/gemini";
import { buildSystemPrompt, type Verbosity } from "@/lib/chatbot/knowledge";
import { CONFIG } from "@/lib/config";

export const maxDuration = 60;

/** 클라이언트가 보내는 이미지 첨부 (base64, data URL prefix 없음). */
interface IncomingImage {
  data: string;
  mimeType: string;
}

/** 클라이언트가 보내는 메시지 한 건. */
interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
  image?: IncomingImage;
}

const MAX_TURNS = 12; // 직전 대화 최대 보존 턴 수 (토큰 절약)
const MAX_LEN = 2000; // 메시지 한 건 최대 길이 (남용 방지)
const MAX_IMAGE_B64 = 7_000_000; // 인라인 이미지 base64 최대 길이(약 5MB) — 초과 시 이미지 무시
const KEEP_IMAGES = 2; // 모델에 전달할 직전 이미지 보존 수 (정확도↔재과금 균형). ChatWidget 의 wire 필터와 값 일치.

function isValidImage(img: unknown): img is IncomingImage {
  if (!img || typeof img !== "object") return false;
  const i = img as Partial<IncomingImage>;
  return (
    typeof i.data === "string" &&
    i.data.length > 0 &&
    i.data.length <= MAX_IMAGE_B64 &&
    typeof i.mimeType === "string" &&
    i.mimeType.startsWith("image/")
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: IncomingMessage[];
      apiKey?: string;
      currentPage?: string;
      verbosity?: string;
    };

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];

    // 텍스트나 이미지 중 하나라도 있는 메시지만 유지 + 최근 MAX_TURNS 턴.
    const usable = rawMessages
      .filter((m) => {
        if (!m) return false;
        const hasText = typeof m.content === "string" && m.content.trim();
        return hasText || isValidImage(m.image);
      })
      .slice(-MAX_TURNS);

    // 멀티모달 턴으로 변환. 이미지는 비용·정확도 균형을 위해
    // "이미지가 달린 메시지 중 최근 KEEP_IMAGES개"에만 포함 (후속 질문에서도 직전 캡처 유지).
    const lastIndex = usable.length - 1;
    const imageIdxs = usable
      .map((m, i) => (isValidImage(m.image) ? i : -1))
      .filter((i) => i >= 0);
    const keepImageSet = new Set(imageIdxs.slice(-KEEP_IMAGES));
    const history: MultimodalTurn[] = usable
      .map((m, idx): MultimodalTurn => {
        const parts: ChatPart[] = [];
        const text =
          typeof m.content === "string" ? m.content.trim().slice(0, MAX_LEN) : "";
        if (text) parts.push({ text });
        if (keepImageSet.has(idx) && isValidImage(m.image)) {
          parts.push({
            inlineData: { data: m.image.data, mimeType: m.image.mimeType },
          });
          // 이미지만 있고 텍스트가 없는 "현재 질문"이면, 분석을 유도하는 기본 지시를 덧붙인다.
          if (!text && idx === lastIndex) {
            parts.unshift({
              text: "첨부한 이미지(주로 앱 화면·에러 스크린샷)를 보고 무엇인지 파악해 도와주세요.",
            });
          }
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts,
        };
      })
      // 이미지만 있던 과거 메시지가 keep 에서 빠지면 parts 가 비는데,
      // 빈 parts 턴은 Gemini 가 거부할 수 있어 제외한다.
      .filter((turn) => turn.parts.length > 0);

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      return Response.json(
        { error: "사용자 메시지가 비어 있습니다." },
        { status: 400 }
      );
    }

    const currentPage =
      typeof body.currentPage === "string" ? body.currentPage : undefined;
    // "더 자세히/짧게" 버튼이 보낸 깊이. 허용값만 채택, 그 외엔 무시(기본 톤).
    const verbosity: Verbosity | undefined =
      body.verbosity === "detailed" || body.verbosity === "concise"
        ? body.verbosity
        : undefined;
    const systemInstruction = buildSystemPrompt(currentPage, verbosity);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generateMultimodalChatStream(
            systemInstruction,
            history,
            CONFIG.CHAT_MODEL,
            body.apiKey
          )) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
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
