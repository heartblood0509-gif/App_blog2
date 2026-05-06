/**
 * 브랜드 글 생성 API.
 *
 * - 입력: profile, template, infoVariantId, mainKeyword, subKeywords, topic, requirements, charCount, selectedTitle, apiKey
 * - 출력: 마크다운 스트리밍 (후기성 /api/generate와 동일한 인터페이스)
 */
import { buildBrandGenerationPrompt } from "@/lib/brand/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { BrandProfile, BrandTemplateId, BrandInfoVariantId } from "@/types/brand";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      template,
      infoVariantId,
      mainKeyword,
      subKeywords,
      topic,
      requirements,
      charCount,
      selectedTitle,
      apiKey,
      referenceText,
      referenceAnalysis,
    } = body as {
      profile: BrandProfile;
      template: BrandTemplateId;
      infoVariantId?: BrandInfoVariantId | null;
      mainKeyword: string;
      subKeywords?: string;
      topic?: string | null;
      requirements?: string;
      charCount: { min: number; max: number };
      selectedTitle: string;
      apiKey?: string;
      referenceText?: string;
      referenceAnalysis?: string;
    };

    if (!profile || !template || !mainKeyword || !selectedTitle) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, template, mainKeyword, selectedTitle)." },
        { status: 400 }
      );
    }

    if (template === "detail") {
      return Response.json(
        { error: "상세페이지글은 아직 준비중입니다." },
        { status: 400 }
      );
    }

    const prompt = buildBrandGenerationPrompt({
      profile,
      template,
      infoVariantId,
      mainKeyword,
      subKeywords,
      topic,
      selectedTitle,
      charCount,
      requirements,
      referenceText,
      referenceAnalysis,
    });

    // 1차 생성 (버퍼)
    const firstContent = await collectStream(prompt, apiKey);
    if (!firstContent) {
      throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
    }

    // 청크 단위 스트리밍 (후기성과 동일 인터페이스)
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
      error instanceof Error ? error.message : "브랜드 글 생성 중 오류가 발생했습니다.";
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
