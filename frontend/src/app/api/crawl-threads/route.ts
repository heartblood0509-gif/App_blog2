import { extractArticle } from "@/lib/crawlers/article";
import {
  rateLimit,
  getClientId,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { success } = rateLimit(getClientId(request), 20, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return Response.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    const result = await extractArticle(url);
    if (!result) {
      return Response.json(
        {
          error:
            "본문을 추출하지 못했습니다. 텍스트를 직접 붙여넣어 주세요.",
        },
        { status: 400 }
      );
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "크롤링 중 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
