/**
 * 검문소 API — 템플릿 ↔ 주제 의미 적합성 검사.
 *
 * - 입력: { template, infoVariantId?, topic?, mainKeyword, subKeywords?, selectedTitle?, apiKey? }
 * - 출력: { match, confidence, reason, suggestion, skipped? }
 * - 어떤 예외도 글 생성 흐름을 막지 않도록, 실패 시 200 + skipped:true 로 통과 처리.
 */
import { checkTemplateFit } from "@/lib/quality/template-fit-validator";
import type { BrandTemplateId, BrandInfoVariantId } from "@/types/brand";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      template,
      infoVariantId,
      topic,
      mainKeyword,
      subKeywords,
      selectedTitle,
      apiKey,
    } = body as {
      template: BrandTemplateId;
      infoVariantId?: BrandInfoVariantId | null;
      topic?: string | null;
      mainKeyword: string;
      subKeywords?: string;
      selectedTitle?: string;
      apiKey?: string;
    };

    if (!template || !mainKeyword) {
      // 필수 누락 → 통과 처리 (검증 스킵). 호출부 로직 단순화.
      return Response.json({
        match: true,
        confidence: 0,
        reason: "필수 입력 누락 (template/mainKeyword)",
        suggestion: "",
        skipped: true,
      });
    }

    const result = await checkTemplateFit(
      {
        template,
        infoVariantId,
        topic,
        mainKeyword,
        subKeywords,
        selectedTitle,
      },
      apiKey
    );

    // 디버그용 — 운영 1~2주 후 제거 예정
    // eslint-disable-next-line no-console
    console.log("[check-fit] in:", { template, infoVariantId, topic, mainKeyword }, "→ out:", result);

    return Response.json(result);
  } catch (error) {
    // 어떤 에러도 글 생성을 막지 않도록 안전 통과
    const message =
      error instanceof Error ? error.message : "검문소 호출 실패";
    return Response.json({
      match: true,
      confidence: 0,
      reason: `검문소 오류: ${message}`,
      suggestion: "",
      skipped: true,
    });
  }
}
