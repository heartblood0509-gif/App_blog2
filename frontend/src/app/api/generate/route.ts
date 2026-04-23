import { buildGenerationPrompt } from "@/lib/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { validateNarrativeOpening } from "@/lib/quality/narrative-validator";
import type { NarrativeType, ToneType, SelectedProduct } from "@/types";

export const maxDuration = 60;

/**
 * Phase F: 후처리 재생성 + 안전장치
 *  1. 1차 전체 생성 (버퍼)
 *  2. 첫 문단 검증 (narrativeType 기준)
 *  3. 실패 시 1회 재생성 + 검증
 *  4. 둘 중 "더 나은 것" 선택 (둘 다 실패 시 첫 결과 폴백)
 *  5. 청크 단위 스트리밍으로 클라이언트 전송 (기존 클라이언트 인터페이스 유지)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      products,
      narrativeType,
      toneType,
      toneExample,
      mainKeyword,
      subKeywords,
      persona,
      requirements,
      charCount,
      selectedTitle,
      referenceAnalysis,
      apiKey,
    } = body as {
      products: SelectedProduct[];
      narrativeType: NarrativeType | null;
      toneType: ToneType;
      toneExample?: string;
      mainKeyword: string;
      subKeywords?: string;
      persona?: string;
      requirements?: string;
      charCount: { min: number; max: number };
      selectedTitle: string;
      referenceAnalysis?: string;
      apiKey?: string;
    };

    const prompt = buildGenerationPrompt({
      products,
      narrativeType,
      toneType,
      toneExample,
      mainKeyword,
      subKeywords,
      persona,
      requirements,
      charCount,
      selectedTitle,
      referenceAnalysis,
    });

    // 1차 생성 (버퍼)
    const firstContent = await collectStream(prompt, apiKey);
    if (!firstContent) {
      throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
    }

    const firstCheck = validateNarrativeOpening(firstContent, narrativeType);

    let finalContent = firstContent;

    if (!firstCheck.passed) {
      // 재생성 시도 (1회만)
      try {
        const secondContent = await collectStream(prompt, apiKey);
        if (secondContent) {
          const secondCheck = validateNarrativeOpening(
            secondContent,
            narrativeType
          );
          // 안전장치: 더 나은 것 선택
          // - 둘 다 통과 → 첫 결과 (변동성 최소화)
          // - 하나만 통과 → 통과한 것
          // - 둘 다 실패 → 첫 결과 (폴백, 퀄리티 저하 0)
          if (secondCheck.passed && !firstCheck.passed) {
            finalContent = secondContent;
          }
        }
      } catch {
        // 재생성 네트워크 오류 → 첫 결과 폴백
        finalContent = firstContent;
      }
    }

    // 청크 단위로 클라이언트에 전송 (기존 스트리밍 인터페이스 유지)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const CHUNK_SIZE = 64;
        for (let i = 0; i < finalContent.length; i += CHUNK_SIZE) {
          controller.enqueue(
            encoder.encode(finalContent.slice(i, i + CHUNK_SIZE))
          );
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
      error instanceof Error ? error.message : "글 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * 스트리밍으로 받아서 전체 문자열로 모은다.
 */
async function collectStream(
  prompt: string,
  apiKey?: string
): Promise<string> {
  let content = "";
  for await (const chunk of generateStream(
    prompt,
    CONFIG.GENERATION_MODEL,
    apiKey
  )) {
    content += chunk;
  }
  return content;
}
