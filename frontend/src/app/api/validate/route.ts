import { validateContent } from "@/lib/quality/validator";

export async function POST(request: Request) {
  try {
    const { text, keyword, charRange, intentMode } = await request.json();

    // 키워드는 선택 — 브랜드 소개/가치입증/상세 템플릿은 키워드 없이 발행할 수 있다.
    // (validateContent 가 빈 키워드를 안전 처리하므로 여기서 막지 않는다.)
    if (!text) {
      return Response.json(
        { error: "텍스트가 필요합니다." },
        { status: 400 }
      );
    }

    const result = validateContent(
      text,
      typeof keyword === "string" ? keyword : "",
      charRange || { min: 1500, max: 2000 },
      Boolean(intentMode),
    );

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "검증 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
