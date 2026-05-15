/**
 * 브랜드 글 품질 수정 API.
 *
 * - 입력: profile, template, infoVariantId, content, failReasons, keyword, apiKey
 * - 출력: 수정된 마크다운 스트리밍 (후기성과 동일 인터페이스)
 */
import { buildBrandFixPrompt } from "@/lib/brand/prompts/fix";
import { generateStream } from "@/lib/gemini";
import { autoReplaceForbiddenWords } from "@/lib/quality/forbidden-words";
import { CONFIG } from "@/lib/config";
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  BrandProposition,
} from "@/types/brand";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      template,
      infoVariantId,
      content,
      failReasons,
      keyword,
      apiKey,
      propositions,
    } = body as {
      profile: BrandProfile;
      template: BrandTemplateId;
      infoVariantId?: BrandInfoVariantId | null;
      content: string;
      failReasons: string[];
      keyword: string;
      apiKey?: string;
      propositions?: BrandProposition[];
    };

    if (!profile || !template || !content || !failReasons || !keyword) {
      return Response.json(
        { error: "profile, template, content, failReasons, keyword가 필요합니다." },
        { status: 400 }
      );
    }

    // 1단계: 금지어 코드 치환 (AI 불필요)
    let fixedContent = autoReplaceForbiddenWords(content);

    // 추가: 브랜드 프로필의 forbiddenWords도 치환 (예: "한세계 여행사" → "여행사")
    const customForbidden = profile.forbidden?.forbiddenWords || [];
    for (const word of customForbidden) {
      if (!word) continue;
      // "한세계 여행사" → "여행사", "한세계 크루즈" → "크루즈" 류로 첫 단어만 제거
      const replacement = word.replace(/^\S+\s+/, "");
      fixedContent = fixedContent.split(word).join(replacement || "");
    }

    // 금지어/실명 치환만으로 해결됐는지 점검
    const remainingReasons = failReasons.filter(
      (r) => !r.includes("금지어") && !r.includes("경쟁사") && !r.includes("한세계")
    );

    if (remainingReasons.length === 0) {
      return new Response(fixedContent, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2단계: 나머지 문제는 AI에게 수정 요청
    const prompt = buildBrandFixPrompt({
      profile,
      template,
      infoVariantId,
      content: fixedContent,
      failReasons: remainingReasons,
      keyword,
      propositions,
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
      error instanceof Error ? error.message : "브랜드 글 수정 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
