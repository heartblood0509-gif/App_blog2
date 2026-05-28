/**
 * SEO·AEO 통합형 본문 생성 API.
 *
 * - 입력: profile, selectedTitle, topic, mainKeyword, subKeywords, requirements, charCount, apiKey
 * - 출력: 마크다운 스트리밍 (후기성·브랜드·AEO와 동일한 인터페이스)
 * - 후처리: 생성 후 마커/표 금지 자동 검증 → 누락 시 콘솔 경고만 (UX 차단 X)
 */
import {
  buildSeoAeoGenerationPrompt,
  buildSeoAeoIntentGenerationPrompt,
} from "@/lib/seo-aeo/prompts/generation";
import { isIntentMode } from "@/lib/seo-aeo/templates";
import { generateStream } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { AeoProfile } from "@/types/aeo";
import type { SeoAeoTemplateType } from "@/types";

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
      templateType,
      attachedProductName,
    } = body as {
      profile: AeoProfile;
      selectedTitle: string;
      topic?: string | null;
      mainKeyword: string;
      subKeywords?: string;
      requirements?: string;
      charCount: { min: number; max: number };
      apiKey?: string;
      templateType?: SeoAeoTemplateType;
      attachedProductName?: string | null;
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

    const effectiveTemplate: SeoAeoTemplateType = templateType ?? "auto";
    const intentMode = isIntentMode(effectiveTemplate);

    // 회귀 보호 — templateType이 "auto" 또는 undefined면 기존 함수 그대로.
    // intent 4종일 때만 새 함수 경로 (기존 buildSeoAeoGenerationPrompt 호출 0).
    const prompt = intentMode
      ? buildSeoAeoIntentGenerationPrompt({
          profile,
          selectedTitle,
          topic,
          mainKeyword,
          subKeywords,
          requirements,
          charCount,
          intent: effectiveTemplate,
          attachedProductName,
        })
      : buildSeoAeoGenerationPrompt({
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

    logQualityChecks(firstContent, intentMode);

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
 * - FAQ 4개 이상 포함되었는지 (auto는 Q[.:], intent는 Q\s+ 형식까지 추가 감지)
 * - 마커가 ## 헤딩에 빠지지 않았는지 (auto는 postit|underline, intent는 4종 모두 허용)
 * - 마크다운 표(파이프 헤더+구분선)가 들어가지는 않았는지
 */
function logQualityChecks(content: string, intentMode: boolean): void {
  const warnings: string[] = [];

  // FAQ 감지 — intent 모드는 새 프롬프트가 "Q "(공백) 형식 의무화. 정규식에 추가.
  const faqRegex = intentMode
    ? /\*\*Q\.|^Q[.:]\s|^Q\s+|^##\s.*FAQ|##\{[^}]+\}\s.*FAQ/gim
    : /\*\*Q\.|^Q[.:]\s|^##\s.*FAQ|##\{[^}]+\}\s.*FAQ/gim;
  const faqMatches = content.match(faqRegex) ?? [];
  if (faqMatches.length < 4) {
    warnings.push(`FAQ 항목 수가 4개 미만으로 보임 (감지: ${faqMatches.length})`);
  }

  // 마커 검증 — intent 모드일 때만 bubble/corner도 정상 인정.
  const headings = content.match(/^##\s.+$/gm) ?? [];
  const markerRegex = intentMode
    ? /^##\{(postit|underline|bubble|corner)\}/
    : /^##\{(postit|underline)\}/;
  const headingsWithoutMarker = headings.filter((h) => !markerRegex.test(h));
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
