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
      error instanceof Error ? error.message : "검증 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
