/**
 * 브랜드 글 품질 검증 API.
 *
 * Phase 4에서 브랜드 전용 검증기(키워드 5~7회 + 경쟁사·"한세계" 검출)로 교체 예정.
 * 현재는 후기성 검증기 그대로 호출 — 글자수/구조 검증은 그대로 유효.
 */
import { validateContent } from "@/lib/quality/validator";

export async function POST(request: Request) {
  try {
    const { text, keyword, charRange } = await request.json();

    if (!text || !keyword) {
      return Response.json(
        { error: "텍스트와 키워드가 필요합니다." },
        { status: 400 }
      );
    }

    const result = validateContent(
      text,
      keyword,
      charRange || { min: 1500, max: 2000 }
    );

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "브랜드 글 검증 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
