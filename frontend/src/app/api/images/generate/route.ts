import {
  generateImage,
  transformImage,
  type GeneratedImageResult,
} from "@/lib/gemini";
import {
  buildTextToImagePrompt,
  buildImageToImagePrompt,
  buildNeutralizedPrompt,
} from "@/lib/prompts/image";
import { CONFIG } from "@/lib/config";

export const maxDuration = 300;

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
  /** AI 변환 시 Pro 모델(gemini-3-pro-image-preview) 사용 여부 */
  useProModel?: boolean;
  excluded?: boolean;
}

interface SlotResult {
  id: string;
  status: "done" | "failed" | "skipped";
  base64?: string;
  mimeType?: string;
  error?: string;
}

async function generateOneSlot(
  slot: SlotRequest,
  content: string,
  apiKey?: string
): Promise<GeneratedImageResult | null> {
  if (slot.mode === "userPhoto" && slot.userPhoto) {
    const prompt = buildImageToImagePrompt(
      slot.description,
      slot.userPhoto.instruction || "",
      content,
      slot.index
    );
    const model = slot.useProModel ? CONFIG.IMAGE_MODEL_PRO : CONFIG.IMAGE_MODEL;
    return await transformImage(
      prompt,
      slot.userPhoto.base64,
      slot.userPhoto.mimeType,
      model,
      apiKey,
      CONFIG.TRANSFORM_REFERENCE_COUNT
    );
  }
  const prompt = buildTextToImagePrompt(
    slot.description,
    content,
    slot.index
  );
  return await generateImage(prompt, CONFIG.IMAGE_MODEL, apiKey);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      content,
      slots,
      apiKey,
    } = body as {
      content: string;
      slots: SlotRequest[];
      apiKey?: string;
    };

    if (!content || !Array.isArray(slots)) {
      return Response.json(
        { error: "content, slots가 필요합니다." },
        { status: 400 }
      );
    }

    const results: SlotResult[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.excluded) {
        results.push({ id: slot.id, status: "skipped" });
        continue;
      }
      try {
        let img = await generateOneSlot(slot, content, apiKey);

        // 중립화 프롬프트로 1회 재시도
        if (!img && CONFIG.IMAGE_MAX_RETRIES > 0) {
          try {
            const neutralPrompt = buildNeutralizedPrompt(slot.description);
            img = await generateImage(neutralPrompt, CONFIG.IMAGE_MODEL, apiKey);
          } catch {
            // 재시도 중 throw는 무시하고 원본 실패로 처리
          }
        }

        if (img) {
          results.push({
            id: slot.id,
            status: "done",
            base64: img.base64,
            mimeType: img.mimeType,
          });
        } else {
          results.push({
            id: slot.id,
            status: "failed",
            error: "이미지 생성 실패 (응답 없음 또는 SAFETY 필터)",
          });
        }
      } catch (err) {
        results.push({
          id: slot.id,
          status: "failed",
          error: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      }

      // 레이트리밋 대응 대기 (마지막 슬롯 뒤에는 생략)
      if (i < slots.length - 1) {
        await new Promise((r) =>
          setTimeout(r, CONFIG.IMAGE_GENERATION_DELAY_MS)
        );
      }
    }

    return Response.json({ results });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "이미지 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
