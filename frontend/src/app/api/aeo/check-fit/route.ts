/**
 * AEO 검문소 API — 글 타입 ↔ 주제 의미 적합성 검사.
 *
 * - 입력: { template, topic?, mainKeyword, subKeywords?, selectedTitle?, apiKey? }
 * - 출력: { match, confidence, reason, suggestions, skipped? }
 * - 어떤 예외도 글 생성 흐름을 막지 않도록 실패 시 200 + skipped:true 로 통과.
 */
import { checkAeoTemplateFit } from "@/lib/aeo/quality/template-fit-validator";
import type { AeoTemplateId } from "@/types/aeo";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      template,
      topic,
      mainKeyword,
      subKeywords,
      selectedTitle,
      apiKey,
    } = body as {
      template: AeoTemplateId;
      topic?: string | null;
      mainKeyword: string;
      subKeywords?: string;
      selectedTitle?: string;
      apiKey?: string;
    };

    if (!template || !mainKeyword) {
      return Response.json({
        match: true,
        confidence: 0,
        reason: "필수 입력 누락 (template/mainKeyword)",
        suggestions: [],
        skipped: true,
      });
    }

    const result = await checkAeoTemplateFit(
      { template, topic, mainKeyword, subKeywords, selectedTitle },
      apiKey
    );

    // eslint-disable-next-line no-console
    console.log(
      "[aeo check-fit] in:",
      { template, topic, mainKeyword },
      "→ out:",
      result
    );

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AEO 검문소 호출 실패";
    return Response.json({
      match: true,
      confidence: 0,
      reason: `AEO 검문소 오류: ${message}`,
      suggestions: [],
      skipped: true,
    });
  }
}
