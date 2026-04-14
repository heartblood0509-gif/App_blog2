import { buildAnalysisPrompt } from "@/lib/prompts/analysis";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const { referenceText, apiKey } = await request.json();

    if (!referenceText) {
      return Response.json(
        { error: "분석할 레퍼런스 텍스트가 필요합니다." },
        { status: 400 }
      );
    }

    const prompt = buildAnalysisPrompt(referenceText);
    const result = await generateText(prompt, CONFIG.ANALYSIS_MODEL, apiKey);

    return Response.json({ analysis: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
