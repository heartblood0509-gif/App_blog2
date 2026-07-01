import {
  generateImageWithAspect,
  transformImage,
  describeImageSubject,
  type GeneratedImageResult,
} from "@/lib/gemini";
import {
  buildTextToImagePrompt,
  buildImageToImagePrompt,
  buildSubjectDescribePrompt,
  buildNeutralizedPrompt,
} from "@/lib/prompts/image";
import { extractIdentificationContext } from "@/lib/image/marker-parser";
import { CONFIG } from "@/lib/config";
import { withProviderSnapshot } from "@/lib/ai/provider-context";
import {
  type ReasonCode,
  parseGeminiError,
  buildHeaders,
} from "@/lib/ai/retry-classify";

// Vercel 등 지원 플랫폼에서만 적용(standalone Node 서버에선 무효). 클라 슬롯 timeout(120초)보다
// 약간 길게 둬, 플랫폼이 강제하더라도 클라가 먼저 마감을 판단하게 한다.
export const maxDuration = 125;

interface SlotRequest {
  id: string;
  index: number;
  description: string;
  groupId: string | null;
  mode: "ai" | "userPhoto";
  userPhoto?: {
    base64: string;
    mimeType: string;
    instruction?: string;
  };
  /** AI 변환 시 Pro 모델(gemini-3-pro-image) 사용 여부 */
  useProModel?: boolean;
  /** AI 생성 모드에서 사용자가 수정한 프롬프트. 있으면 기본 빌더 무시하고 그대로 전송. (레거시 — 현재 클라는 미사용) */
  customPrompt?: string;
  /** AI 생성(text-to-image) 비율. "16:9" | "1:1" | "9:16". 미지정/미지원이면 "1:1". */
  aspectRatio?: string;
  excluded?: boolean;
}

/** 지원 비율만 통과. 그 외/누락은 "1:1" 폴백 — 잘못된 값이 imageConfig로 가서 나는 런타임 400 예방. */
const SUPPORTED_ASPECTS = new Set(["16:9", "1:1", "9:16"]);
function normalizeAspect(a?: string): string {
  return a && SUPPORTED_ASPECTS.has(a) ? a : "1:1";
}


interface SlotResultDone {
  id: string;
  status: "done";
  base64: string;
  mimeType: string;
}

interface SlotResultFailed {
  id: string;
  status: "failed";
  reasonCode: ReasonCode;
  error?: string;
  retryable: boolean;
  retryAfterMs?: number;
}

interface SlotResultSkipped {
  id: string;
  status: "skipped";
}

type SlotResult = SlotResultDone | SlotResultFailed | SlotResultSkipped;

function logSlot(event: string, data: Record<string, unknown>) {
  // 구조화된 한 줄 로그. grep 친화적.
  console.log(`[images/generate] ${event}`, JSON.stringify(data));
}

async function generateOneSlot(
  slot: SlotRequest,
  content: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  if (slot.mode === "userPhoto" && slot.userPhoto) {
    // 비전 프리패스: 모호한 접사(부위 오인)를 막기 위해 사진에 담긴 것을 한 줄 식별.
    // 식별 근거로 '글 전체'(모든 이미지 마커 제거)를 준다 — 부위명이 ±500자 밖에 있어
    // 놓치던 문제 해결. 생성엔 여전히 미주입. best-effort — 실패 시 "" 폴백.
    const ctx = content ? extractIdentificationContext(content) : "";
    const subject = await describeImageSubject(
      slot.userPhoto.base64,
      slot.userPhoto.mimeType,
      buildSubjectDescribePrompt(ctx),
      CONFIG.TRANSFORM_SUBJECT_MODEL,
      apiKey
    );
    logSlot("transform_subject", {
      slotId: slot.id,
      subject,
      ctxChars: ctx.length,
      // 사용자 변환 지시문(비웠으면 ""). '지시문이 프롬프트에 실렸나'(배선) 확인용 —
      // 모델이 따랐는지(순종)는 결과 이미지로만 판단.
      instruction: slot.userPhoto.instruction || "",
    });
    // 생성엔 원본 사진 + (식별된 한 줄 피사체)만 — 블로그 본문/장면 서사는 주입하지 않음.
    const prompt = buildImageToImagePrompt(slot.userPhoto.instruction || "", subject);
    const model = slot.useProModel ? CONFIG.IMAGE_MODEL_PRO : CONFIG.IMAGE_MODEL;
    return await transformImage(
      prompt,
      slot.userPhoto.base64,
      slot.userPhoto.mimeType,
      model,
      apiKey
    );
  }
  const finalAspect = normalizeAspect(slot.aspectRatio);
  const prompt =
    slot.customPrompt && slot.customPrompt.trim().length > 0
      ? slot.customPrompt
      : buildTextToImagePrompt(slot.description, content, slot.index, finalAspect);
  return await generateImageWithAspect(
    prompt,
    finalAspect,
    CONFIG.IMAGE_MODEL,
    apiKey
  );
}


export async function POST(request: Request): Promise<Response> {
  // 한 요청(=한 슬롯) 안에서 describeImageSubject→transformImage 가 같은 provider 를
  // 쓰도록 provider 를 1회 스냅샷으로 고정 (코덱스 리뷰 ⑦).
  return withProviderSnapshot(() => handlePost(request));
}

async function handlePost(request: Request): Promise<Response> {
  const requestStart = Date.now();
  let roundId: string | null = null;
  let slotId: string | null = null;

  try {
    const body = await request.json();
    const {
      content,
      slots,
      apiKey,
      roundId: bodyRoundId,
    } = body as {
      content: string;
      slots: SlotRequest[];
      apiKey?: string;
      roundId?: string;
    };
    roundId = bodyRoundId ?? null;

    if (!content || !Array.isArray(slots)) {
      return Response.json(
        { error: "content, slots가 필요합니다." },
        { status: 400 }
      );
    }
    if (slots.length !== 1) {
      return Response.json(
        {
          error: "slots는 정확히 1개여야 합니다. 일괄 생성은 클라이언트가 슬롯별로 호출하세요.",
        },
        { status: 400 }
      );
    }

    const slot = slots[0];
    slotId = slot.id;

    if (slot.excluded) {
      logSlot("slot_skipped", { roundId, slotId });
      return Response.json({
        results: [{ id: slot.id, status: "skipped" }] satisfies SlotResult[],
      });
    }

    const slotStart = Date.now();
    const model = slot.useProModel ? CONFIG.IMAGE_MODEL_PRO : CONFIG.IMAGE_MODEL;
    logSlot("slot_start", {
      roundId,
      slotId,
      index: slot.index,
      mode: slot.mode,
      model,
      useProModel: !!slot.useProModel,
      hasCustomPrompt:
        slot.mode === "ai" &&
        !!slot.customPrompt &&
        slot.customPrompt.trim().length > 0,
    });

    let img: GeneratedImageResult | null = null;
    try {
      img = await generateOneSlot(slot, content, apiKey);
    } catch (err) {
      const parsed = parseGeminiError(err);
      const durationMs = Date.now() - slotStart;
      logSlot("slot_failed", {
        roundId,
        slotId,
        durationMs,
        reason: "throw",
        httpStatus: parsed.status,
        reasonCode: parsed.reasonCode,
        retryAfterMs: parsed.retryAfterMs,
        error: parsed.message.slice(0, 500),
      });
      const failed: SlotResultFailed = {
        id: slot.id,
        status: "failed",
        reasonCode: parsed.reasonCode,
        retryable: parsed.retryable,
        retryAfterMs: parsed.retryAfterMs,
        error: parsed.message.slice(0, 500),
      };
      return Response.json(
        { results: [failed], reasonCode: parsed.reasonCode, retryAfterMs: parsed.retryAfterMs },
        { status: parsed.status, headers: buildHeaders(parsed) }
      );
    }

    // SAFETY 또는 빈 응답 → 중립화 프롬프트 1회 재시도 (서버에서 처리, clean separation)
    const hasCustomPrompt =
      slot.mode === "ai" &&
      !!slot.customPrompt &&
      slot.customPrompt.trim().length > 0;
    let neutralized = false;
    // 중립화 재시도는 AI 생성(text-to-image) 전용. 변환(userPhoto)에 적용하면
    // 원본을 버리고 슬롯 설명으로 '다른 그림'을 만들어 성공으로 반환하므로 제외.
    if (!img && slot.mode === "ai" && !hasCustomPrompt && CONFIG.IMAGE_MAX_RETRIES > 0) {
      logSlot("slot_neutralize_retry", { roundId, slotId });
      try {
        const finalAspect = normalizeAspect(slot.aspectRatio);
        const neutralPrompt = buildNeutralizedPrompt(slot.description, finalAspect);
        img = await generateImageWithAspect(
          neutralPrompt,
          finalAspect,
          CONFIG.IMAGE_MODEL,
          apiKey
        );
        neutralized = true;
      } catch (e) {
        // 중립화 재시도 중 throw는 원본 실패로 (HTTP 200, SAFETY로 분류 — 재시도 의미 없음)
        logSlot("slot_neutralize_throw", {
          roundId,
          slotId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const durationMs = Date.now() - slotStart;

    if (img) {
      logSlot("slot_done", {
        roundId,
        slotId,
        durationMs,
        neutralized,
        base64Bytes: img.base64.length,
        totalRequestMs: Date.now() - requestStart,
      });
      const done: SlotResultDone = {
        id: slot.id,
        status: "done",
        base64: img.base64,
        mimeType: img.mimeType,
      };
      return Response.json({ results: [done] satisfies SlotResult[] });
    }

    // 여기 도달 = gemini.ts가 null 반환(SAFETY 차단) 또는 SAFETY 외 빈 응답.
    // 원인을 단정할 수 없으므로 reasonCode는 보수적으로 safety로 두되,
    // 사용자 안내는 단정형이 아닌 '가능형'으로 + 변환은 일시 오류 여지를 두어 재시도 유도.
    const reasonCode: ReasonCode = "safety";
    const isTransform = slot.mode === "userPhoto";
    logSlot("slot_failed", {
      roundId,
      slotId,
      durationMs,
      reason: "null_response",
      reasonCode,
      mode: slot.mode,
      neutralized,
      totalRequestMs: Date.now() - requestStart,
    });
    const failed: SlotResultFailed = {
      id: slot.id,
      status: "failed",
      reasonCode,
      // 변환 빈 응답은 일시 오류일 수 있어 재시도 여지를 둔다(단일 슬롯은 사용자 수동 재시도).
      retryable: isTransform,
      error: isTransform
        ? "AI가 이 사진을 변환하지 못했어요. 다시 한 번 시도하거나 다른 사진을 써보세요. 신체 노출·의료·민감한 사진은 안전 필터에 막힐 수 있어요."
        : "AI가 이미지를 만들지 못했어요. 잠시 후 다시 시도하거나 표현을 부드럽게 바꿔보세요(안전 필터일 수 있어요).",
    };
    return Response.json({ results: [failed] satisfies SlotResult[] });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "이미지 생성 중 오류가 발생했습니다.";
    logSlot("request_error", {
      roundId,
      slotId,
      error: message,
      durationMs: Date.now() - requestStart,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
