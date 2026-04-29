import { generateImageWithAspect } from "@/lib/gemini";
import {
  buildThreadsImageGenerationPrompt,
  type ImageStyle,
} from "@/lib/prompts/threads";
import {
  rateLimit,
  getClientId,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const maxDuration = 120;

const SUPPORTED_RATIOS = [
  "1:1",
  "3:4",
  "4:3",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
] as const;

const IMAGE_MODEL = "gemini-3.1-flash-image-preview";

export async function POST(request: Request) {
  const { success } = rateLimit(getClientId(request), 10, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const body = await request.json();
    const {
      threadsContent,
      imageAnalysis,
      aspectRatio = "1:1",
      count = 1,
      style = "realistic",
      customPrompt,
      apiKey,
    } = body as {
      threadsContent?: string;
      imageAnalysis?: string;
      aspectRatio?: string;
      count?: number;
      style?: ImageStyle;
      customPrompt?: string;
      apiKey?: string;
    };

    if (!threadsContent && !customPrompt) {
      return Response.json(
        { error: "쓰레드 내용 또는 프롬프트가 필요합니다." },
        { status: 400 }
      );
    }

    const imageCount = Math.min(Math.max(1, count), 2);
    const finalRatio = (SUPPORTED_RATIOS as readonly string[]).includes(
      aspectRatio
    )
      ? aspectRatio
      : "3:4";

    const images: { data: string; mimeType: string }[] = [];

    for (let i = 0; i < imageCount; i++) {
      const prompt =
        customPrompt ||
        buildThreadsImageGenerationPrompt(
          threadsContent || "",
          imageAnalysis,
          style,
          i
        );
      try {
        const result = await generateImageWithAspect(
          prompt,
          finalRatio,
          IMAGE_MODEL,
          apiKey
        );
        if (result) {
          images.push({ data: result.base64, mimeType: result.mimeType });
        } else if (images.length === 0) {
          return Response.json(
            {
              error:
                "이미지 생성이 거부되었습니다. 다른 주제로 시도해주세요.",
            },
            { status: 400 }
          );
        }

        if (i < imageCount - 1) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (images.length > 0) {
          console.error(
            `이미지 ${i + 1}번째 생성 실패, ${images.length}장만 반환:`,
            msg
          );
          break;
        }
        throw error;
      }
    }

    if (images.length === 0) {
      return Response.json(
        { error: "이미지가 생성되지 않았습니다. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    return Response.json({ images });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "이미지 생성 중 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
