/**
 * 후기성 블로그 — 제품 자동 등록 도우미 API.
 *
 * - 입력: { freeformInput, hasReviews, apiKey? }
 * - 출력: UserProduct 폼 필드 + missingFields 배열 JSON
 *
 * 브랜드 어시스턴트(`/api/brand/profile-assist`)와 동일 패턴 (의도적 복제).
 */
import { buildProductAssistPrompt } from "@/lib/products/prompts/product-assist";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { freeformInput, hasReviews, apiKey } = body as {
      freeformInput: string;
      hasReviews?: boolean;
      apiKey?: string;
    };

    if (!freeformInput || freeformInput.trim().length < 5) {
      return Response.json(
        { error: "제품 설명을 최소 5자 이상 입력해주세요." },
        { status: 400 }
      );
    }

    const prompt = buildProductAssistPrompt({
      freeformInput,
      hasReviews: hasReviews ?? true,
    });
    const raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);

    // JSON 추출 (코드블록 둘러쌌을 수도 있음)
    let jsonStr = raw.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    // 첫 { ~ 마지막 } 만 추출 (안전 폴백)
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }

    const parsed = JSON.parse(jsonStr);
    return Response.json(parsed);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "제품 도우미 호출 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
