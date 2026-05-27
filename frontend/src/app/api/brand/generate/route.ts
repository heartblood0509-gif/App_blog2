/**
 * 브랜드 글 생성 API.
 *
 * - 입력: profile, template, infoVariantId, mainKeyword, subKeywords, topic, requirements, charCount, selectedTitle, apiKey
 * - 출력: 마크다운 스트리밍 (후기성 /api/generate와 동일한 인터페이스)
 */
import { buildBrandGenerationPrompt } from "@/lib/brand/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { backendFetch } from "@/lib/backend-fetch";
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  BrandIntroVariantId,
  BrandValueProofVariantId,
  BrandDetailVariantId,
  AnalysisRecord,
} from "@/types/brand";
import type { UserProduct } from "@/types";
import { detectLabelLeak } from "@/lib/prompts/attached-product-context";

export const maxDuration = 60;

// V1 feature flag (A9) — 미설정 또는 "1"이 아니면 attachedProduct 무시
const PRODUCT_ATTACH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PRODUCT_ATTACH === "1";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      template,
      infoVariantId,
      introVariantId,
      valueProofVariantId,
      detailVariantId,
      mainKeyword,
      subKeywords,
      topic,
      requirements,
      charCount,
      selectedTitle,
      apiKey,
      referenceText,
      referenceAnalysis,
      referenceExcerpts,
      analysisRecordId,
      attachedProduct,
    } = body as {
      profile: BrandProfile;
      template: BrandTemplateId;
      infoVariantId?: BrandInfoVariantId | null;
      introVariantId?: BrandIntroVariantId | null;
      valueProofVariantId?: BrandValueProofVariantId | null;
      detailVariantId?: BrandDetailVariantId | null;
      mainKeyword: string;
      subKeywords?: string;
      topic?: string | null;
      requirements?: string;
      charCount: { min: number; max: number };
      selectedTitle: string;
      apiKey?: string;
      referenceText?: string;
      referenceAnalysis?: string;
      referenceExcerpts?: string[];
      analysisRecordId?: string;
      /** V1 첨부 제품 (선택) */
      attachedProduct?: UserProduct;
    };

    // flag off면 무시 (A9) → 빌더가 격리 패턴으로 기존 경로 100% 유지
    const effectiveAttachedProduct = PRODUCT_ATTACH_ENABLED ? attachedProduct : undefined;

    if (!profile || !template || !mainKeyword || !selectedTitle) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, template, mainKeyword, selectedTitle)." },
        { status: 400 }
      );
    }

    // structure-based 모드 — 보관함 분석 레코드를 백엔드에서 fetch (4개 템플릿 공통)
    let analysisRecord: AnalysisRecord | undefined;
    const isStructureBased =
      infoVariantId === "info-structure-based" ||
      introVariantId === "intro-structure-based" ||
      valueProofVariantId === "value-proof-structure-based" ||
      detailVariantId === "detail-structure-based";
    if (isStructureBased) {
      if (!analysisRecordId) {
        return Response.json(
          { error: "[서사 구조 기반 작성] 모드는 보관함에서 분석을 선택해야 합니다." },
          { status: 400 }
        );
      }
      try {
        const recordRes = await backendFetch(
          `/analysis-records/${encodeURIComponent(analysisRecordId)}`,
          { cache: "no-store" }
        );
        if (!recordRes.ok) {
          return Response.json(
            { error: "선택한 분석 레코드를 불러오지 못했습니다." },
            { status: 400 }
          );
        }
        analysisRecord = (await recordRes.json()) as AnalysisRecord;
      } catch {
        return Response.json(
          { error: "백엔드 보관함에 연결할 수 없습니다." },
          { status: 502 }
        );
      }
    }

    const prompt = buildBrandGenerationPrompt({
      profile,
      template,
      infoVariantId,
      introVariantId,
      valueProofVariantId,
      detailVariantId,
      mainKeyword,
      subKeywords,
      topic,
      selectedTitle,
      charCount,
      requirements,
      referenceText,
      referenceAnalysis,
      referenceExcerpts,
      analysisRecordId,
      analysisRecord,
      attachedProduct: effectiveAttachedProduct,
    });

    // 1차 생성 (버퍼)
    const firstContent = await collectStream(prompt, apiKey);
    if (!firstContent) {
      throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
    }

    // dev 모드 라벨 누수 가드 (A6) — 첨부 활성 시에만 검사
    if (process.env.NODE_ENV === "development" && effectiveAttachedProduct) {
      const leaks = detectLabelLeak(firstContent);
      if (leaks.length > 0) {
        console.warn(
          `[attached-product] 라벨 누수 감지 (brand/${template}):`,
          leaks,
        );
      }
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
