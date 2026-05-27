import {
  buildStorySkeletonPrompt,
  type ProductSummary,
  type UserAnswers,
} from "@/lib/prompts/story-skeleton";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";

// generateText는 AbortSignal을 받지 않아 진짜 취소는 안 됨.
// Next route 레벨에서만 응답 시간을 제한.
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { keyword, products, userAnswers, apiKey } = body as {
      keyword?: string;
      products?: ProductSummary[];
      userAnswers?: UserAnswers;
      apiKey?: string;
    };

    const trimmed = (keyword ?? "").trim();
    if (!trimmed) {
      return Response.json({ error: "메인 키워드가 비어 있습니다." }, { status: 400 });
    }

    const prompt = buildStorySkeletonPrompt(trimmed, products ?? [], userAnswers);
    const raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);

    const story = sanitizeStory(raw);
    if (!story) {
      return Response.json({ error: "AI 응답이 비어 있습니다." }, { status: 502 });
    }
    return Response.json({ story });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "스토리 추천 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

// LLM이 가끔 prefix/따옴표/코드블록을 붙이므로 제거.
function sanitizeStory(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:\w+)?\n?/, "").replace(/\n?```$/, "");
  }
  s = s.replace(/^\[?Output\]?\s*:\s*/i, "");
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}
