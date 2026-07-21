/**
 * 블로그 본문 → 유튜브 스크립트 변환 라우트.
 *
 * 설계: D안 (AI는 매칭만 찾고, 코드가 치환).
 * 이 라우트는 "매칭 찾기"까지만 담당하고, 실제 치환은 프론트에서
 * `applyMatches`(lib/youtube-script/apply-matches.ts)가 수행한다.
 *
 * Gemini 호출은 결정론적 설정 (temperature=0, topP=0.1, topK=1)으로
 * 같은 본문에 같은 매칭이 나오도록 한다. responseMimeType=application/json
 * 으로 JSON 출력 강제.
 */
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { buildYoutubeMatchPrompt } from "@/lib/prompts/youtube-script";
import {
  rateLimit,
  getClientId,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";

export const maxDuration = 60;

interface YoutubeMatch {
  old: string;
  new: string;
}

export async function POST(request: Request) {
  // 전역 킬스위치 OFF면 유튜브 변환 자체를 차단(직접 호출 옆문 방어 + Gemini 비용 차단).
  if (!YOUTUBE_FEATURE_ENABLED) {
    return Response.json(
      { error: "YouTube feature is disabled" },
      { status: 403 },
    );
  }

  const { success } = rateLimit(getClientId(request), 10, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const body = await request.json();
    const { blogContent, apiKey } = body as {
      blogContent?: string;
      apiKey?: string;
    };

    if (!blogContent || typeof blogContent !== "string") {
      return Response.json(
        { error: "blogContent가 필요합니다." },
        { status: 400 }
      );
    }
    if (blogContent.trim().length < 200) {
      return Response.json(
        { error: "본문이 너무 짧습니다 (최소 200자)." },
        { status: 400 }
      );
    }

    const prompt = buildYoutubeMatchPrompt(blogContent);
    const raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey, {
      temperature: 0,
      topP: 0.1,
      topK: 1,
      responseMimeType: "application/json",
    });

    // JSON 파싱 + matches 배열 검증. 실패 시 빈 배열 폴백(본문 그대로 사용 가능).
    let matches: YoutubeMatch[] = [];
    try {
      const parsed = JSON.parse(raw) as { matches?: unknown };
      if (Array.isArray(parsed.matches)) {
        matches = parsed.matches
          .filter(
            (m): m is YoutubeMatch =>
              typeof m === "object" &&
              m !== null &&
              typeof (m as { old?: unknown }).old === "string" &&
              typeof (m as { new?: unknown }).new === "string" &&
              (m as YoutubeMatch).old.length > 0 &&
              (m as YoutubeMatch).new.length > 0
          )
          // 단일 한 글자 매칭은 한 번 더 거름 (프롬프트 규칙 위반 방어)
          .filter((m) => m.old.length >= 2);
      }
    } catch {
      // JSON 파싱 실패 시 빈 매칭 — 본문 그대로 사용 가능 안내가 UI에 표시됨
      matches = [];
    }

    return Response.json({ matches });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "유튜브 변환 중 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
