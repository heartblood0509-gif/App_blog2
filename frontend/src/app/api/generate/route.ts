import { buildGenerationPrompt } from "@/lib/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { withRetryAsync } from "@/lib/ai/with-retry";
import { geminiErrorResponse } from "@/lib/ai/retry-classify";
import { withProviderSnapshot } from "@/lib/ai/provider-context";
import { validateNarrativeOpening } from "@/lib/quality/narrative-validator";
import type { NarrativeType, ProductInfo, ToneType, SelectedProduct } from "@/types";

export const maxDuration = 60;

function getSelectedProductUrls(
  products: SelectedProduct[],
  customProductInfoById?: Record<string, ProductInfo>
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const selected of products) {
    const url = customProductInfoById?.[selected.id]?.productUrl?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

function isHashtagLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#")) return false;
  return /^(#[^\s#]+)(\s+#[^\s#]+)*$/.test(trimmed);
}

function placeProductUrlsBeforeHashtags(content: string, urls: string[]): string {
  if (urls.length === 0) return content;

  const urlSet = new Set(urls);
  const lines = content
    .split(/\r?\n/)
    .filter((line) => !urlSet.has(line.trim()));

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  const hashtagLines: string[] = [];
  while (lines.length > 0 && isHashtagLine(lines[lines.length - 1])) {
    hashtagLines.unshift(lines.pop()!.trim());
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
  }

  const body = lines.join("\n").trimEnd();
  const suffix = hashtagLines.length > 0
    ? `${urls.join("\n")}\n\n${hashtagLines.join("\n")}`
    : urls.join("\n");

  return body ? `${body}\n\n${suffix}` : suffix;
}

/**
 * Phase F: 후처리 재생성 + 안전장치
 *  1. 1차 전체 생성 (버퍼)
 *  2. 첫 문단 검증 (narrativeType 기준)
 *  3. 실패 시 1회 재생성 + 검증
 *  4. 둘 중 "더 나은 것" 선택 (둘 다 실패 시 첫 결과 폴백)
 *  5. 청크 단위 스트리밍으로 클라이언트 전송 (기존 클라이언트 인터페이스 유지)
 */
export async function POST(request: Request) {
  // 한 요청 내내 provider(gemini/openai)·모델을 고정 — 재시도/품질 재생성 사이에
  // 사용자가 토글을 바꿔도 한 글이 섞이지 않게 (이미지 라우트와 동일 패턴).
  return withProviderSnapshot(() => handlePost(request));
}

async function handlePost(request: Request): Promise<Response> {
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
      referenceExcerpts,
      topic,
      customProductInfoById,
      productPlacementMode,
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
      referenceExcerpts?: string[];
      topic?: string;
      customProductInfoById?: Record<string, ProductInfo>;
      productPlacementMode?: "link" | "mention";
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
      referenceExcerpts,
      topic,
      customProductInfoById,
      productPlacementMode,
    });

    // 1차 생성 (버퍼) — 429/503/500은 서버에서 재시도(통째 버퍼링이라 클라 중복 없음)
    const firstContent = await withRetryAsync(
      () => collectStream(prompt, apiKey),
      { retries: CONFIG.TEXT_TRANSIENT_RETRIES, backoffMs: CONFIG.TEXT_BACKOFF_MS }
    );
    if (!firstContent) {
      throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
    }

    const firstCheck = validateNarrativeOpening(firstContent, narrativeType);

    let finalContent = firstContent;

    if (!firstCheck.passed) {
      // 재생성 시도 (1회만)
      try {
        const secondContent = await withRetryAsync(
          () => collectStream(prompt, apiKey),
          { retries: CONFIG.TEXT_REGEN_RETRIES, backoffMs: CONFIG.TEXT_BACKOFF_MS }
        );
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

    // 사용자가 글 설정에서 "link"를 고른 경우에만 후처리로 URL을 본문 끝에 박는다.
    // "mention" (기본값)이면 프롬프트가 이미 자연 언급 톤을 강제했고, 여기서 URL을
    // 자동 삽입하면 그 노력이 무력화된다.
    if (productPlacementMode === "link") {
      finalContent = placeProductUrlsBeforeHashtags(
        finalContent,
        getSelectedProductUrls(products, customProductInfoById)
      );
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
    // 429/무료등급/서버오류를 reasonCode와 함께 분류 응답 → 프론트가 원인별 안내.
    return geminiErrorResponse(error);
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
