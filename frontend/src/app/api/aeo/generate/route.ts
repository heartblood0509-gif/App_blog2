/**
 * AEO 글 생성 API.
 *
 * - 입력: profile, template, mainKeyword, subKeywords, topic, requirements,
 *         charCount, selectedTitle, targetQueries, sources, apiKey
 * - 출력: 마크다운 스트리밍 (후기성·브랜드와 동일한 인터페이스)
 */
import { buildAeoGenerationPrompt } from "@/lib/aeo/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { AeoProfile, AeoTemplateId, AeoSource } from "@/types/aeo";
import type { UserProduct } from "@/types";
import { detectLabelLeak } from "@/lib/prompts/attached-product-context";

export const maxDuration = 60;

// V1 feature flag (A9)
const PRODUCT_ATTACH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PRODUCT_ATTACH === "1";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      template,
      mainKeyword,
      subKeywords,
      topic,
      requirements,
      charCount,
      selectedTitle,
      targetQueries,
      sources,
      apiKey,
      attachedProduct,
    } = body as {
      profile: AeoProfile;
      template: AeoTemplateId;
      mainKeyword: string;
      subKeywords?: string;
      topic?: string | null;
      requirements?: string;
      charCount: { min: number; max: number };
      selectedTitle: string;
      targetQueries?: string[];
      sources?: AeoSource[];
      apiKey?: string;
      /** V1 첨부 제품 (선택) */
      attachedProduct?: UserProduct;
    };

    const effectiveAttachedProduct = PRODUCT_ATTACH_ENABLED ? attachedProduct : undefined;

    if (!profile || !template || !mainKeyword || !selectedTitle) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, template, mainKeyword, selectedTitle)." },
        { status: 400 }
      );
    }

    const prompt = buildAeoGenerationPrompt({
      profile,
      template,
      mainKeyword,
      subKeywords,
      topic,
      selectedTitle,
      charCount,
      requirements,
      targetQueries,
      sources,
      attachedProduct: effectiveAttachedProduct,
    });

    // 1차 생성 (버퍼) — 브랜드 generate와 동일 패턴
    const firstContent = await collectStream(prompt, apiKey);
    if (!firstContent) {
      throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
    }

    // dev 모드 라벨 누수 가드 (A6)
    if (process.env.NODE_ENV === "development" && effectiveAttachedProduct) {
      const leaks = detectLabelLeak(firstContent);
      if (leaks.length > 0) {
        console.warn(
          `[attached-product] 라벨 누수 감지 (aeo/${template}):`,
          leaks,
        );
      }
    }

    // 청크 단위 스트리밍 (후기성·브랜드와 동일 인터페이스)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const CHUNK_SIZE = 64;
        for (let i = 0; i < firstContent.length; i += CHUNK_SIZE) {
          controller.enqueue(encoder.encode(firstContent.slice(i, i + CHUNK_SIZE)));
        }
        controller.close();
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
      error instanceof Error ? error.message : "AEO 글 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function collectStream(prompt: string, apiKey?: string): Promise<string> {
  let content = "";
  for await (const chunk of generateStream(prompt, CONFIG.GENERATION_MODEL, apiKey)) {
    content += chunk;
  }
  return content;
}
