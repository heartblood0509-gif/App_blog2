/**
 * SEO·AEO 통합형 본문 생성 API.
 *
 * - 입력: profile, selectedTitle, topic, mainKeyword, subKeywords, requirements, charCount, apiKey
 * - 출력: 마크다운 스트리밍 (후기성·브랜드·AEO와 동일한 인터페이스)
 * - 후처리: 생성 후 마커/표 금지 자동 검증 → 누락 시 콘솔 경고만 (UX 차단 X)
 */
import { buildSeoAeoGenerationPrompt } from "@/lib/seo-aeo/prompts/generation";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { AeoProfile } from "@/types/aeo";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profile,
      selectedTitle,
      topic,
      mainKeyword,
      subKeywords,
      requirements,
      charCount,
      apiKey,
    } = body as {
      profile: AeoProfile;
      selectedTitle: string;
      topic?: string | null;
      mainKeyword: string;
      subKeywords?: string;
      requirements?: string;
      charCount: { min: number; max: number };
      apiKey?: string;
    };

    if (!profile) {
      return Response.json(
        { error: "AEO 프로필이 누락되었습니다." },
        { status: 400 }
      );
    }
    if (!selectedTitle || !mainKeyword) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (selectedTitle, mainKeyword)." },
        { status: 400 }
      );
    }

    const prompt = buildSeoAeoGenerationPrompt({
      profile,
      selectedTitle,
      topic,
      mainKeyword,
      subKeywords,
      requirements,
      charCount,
    });

    const firstContent = await collectStream(prompt, apiKey);
    if (!firstContent) {
      throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
    }

    logQualityChecks(firstContent);

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
      error instanceof Error
        ? error.message
        : "SEO·AEO 글 생성 중 오류가 발생했습니다.";
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

/**
 * 생성 결과의 품질을 콘솔로만 로깅 (사용자에게 강제 차단 X).
 * - FAQ 4개 이상 포함되었는지
 * - ##{postit} / ##{underline} 마커가 ## 헤딩에 빠지지 않았는지
 * - 마크다운 표(파이프 헤더+구분선)가 들어가지는 않았는지
 */
function logQualityChecks(content: string): void {
  const warnings: string[] = [];

  const faqMatches = content.match(/\*\*Q\.|^Q[.:]\s|^##\s.*FAQ|##\{[^}]+\}\s.*FAQ/gim) ?? [];
  if (faqMatches.length < 4) {
    warnings.push(`FAQ 항목 수가 4개 미만으로 보임 (감지: ${faqMatches.length})`);
  }

  const headings = content.match(/^##\s.+$/gm) ?? [];
  const headingsWithoutMarker = headings.filter(
    (h) => !/^##\{(postit|underline)\}/.test(h)
  );
  if (headingsWithoutMarker.length > 0) {
    warnings.push(
      `마커 없는 ## 헤딩 ${headingsWithoutMarker.length}개: ${headingsWithoutMarker.slice(0, 3).join(" | ")}`
    );
  }

  const mdTable = /^\s*\|.+\|\s*$\n^\s*\|\s*[-:]+\s*\|/m.test(content);
  if (mdTable) {
    warnings.push("마크다운 표(파이프) 감지됨 — 발행 시 깨질 수 있음");
  }

  if (warnings.length > 0) {
    console.warn("[seo-aeo/generate] 품질 경고:", warnings);
  }
}
