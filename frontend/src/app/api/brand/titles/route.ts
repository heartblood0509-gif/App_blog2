/**
 * 브랜드 제목 생성 API.
 *
 * 정보성글(info)만 지원. 다른 템플릿은 빈 배열 반환 (사용자가 공식 줄 때까지 보류).
 * 카드별 titleFormula(톤 견본)가 있으면 그 결로, 없으면 안전한 폴백 톤으로 생성.
 */
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import { buildBrandTitlePrompt } from "@/lib/brand/prompts/title";
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  AnalysisRecord,
} from "@/types/brand";

export const maxDuration = 60;

interface RequestBody {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: BrandInfoVariantId | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  count?: number;
  /** Step 2에서 사용자가 고른 분석 카드 ID. 있으면 백엔드에서 fetch 후 titleFormula 활용 */
  analysisRecordId?: string | null;
  /** info-custom(직접 레퍼런스) 모드용 — 백엔드 카드가 아니라 사용자 임시 분석 결과를 그대로 전달 */
  analysisRecord?: AnalysisRecord | null;
  apiKey?: string;
}

interface ParsedSuggestion {
  title: string;
  pattern?: string;
  emotion?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    // 정보성글 분석 카드 결정 흐름:
    // 1. body.analysisRecord 객체 직접 전달 (info-custom 임시 분석) → 우선 사용
    // 2. body.analysisRecordId (보관함 카드) → 백엔드 fetch
    // 둘 다 없으면 폴백 톤. 어느 경우든 에러 던지지 않음 — 제목 생성은 보조 단계.
    let analysisRecord: AnalysisRecord | null = null;
    if (body.template === "info") {
      if (body.analysisRecord) {
        analysisRecord = body.analysisRecord;
      } else if (body.analysisRecordId) {
        try {
          const recordRes = await fetch(
            `${CONFIG.BACKEND_URL}/analysis-records/${encodeURIComponent(body.analysisRecordId)}`,
            { cache: "no-store" }
          );
          if (recordRes.ok) {
            analysisRecord = (await recordRes.json()) as AnalysisRecord;
          }
        } catch {
          // 백엔드 fetch 실패 → 폴백으로 진행
        }
      }
    }

    const prompt = buildBrandTitlePrompt({
      profile: body.profile,
      template: body.template,
      infoVariantId: body.infoVariantId,
      mainKeyword: body.mainKeyword,
      subKeywords: body.subKeywords,
      topic: body.topic,
      count: body.count ?? 5,
      analysisRecord,
    });

    // 미지원 템플릿(intro/value-proof/detail) → 빈 배열 (사용자가 공식 줄 때까지 비활성)
    if (prompt === null) {
      return Response.json({ suggestions: [] });
    }

    const raw = await generateText(
      prompt,
      CONFIG.GENERATION_MODEL,
      body.apiKey
    );

    // LLM이 마크다운 코드블록으로 감싸는 경우 제거
    let jsonStr = raw.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
    }

    const parsed = JSON.parse(jsonStr) as ParsedSuggestion[];

    // UI 호환: 공용 StepTitleSelect는 type 필드를 Badge에 표시.
    // "pattern · emotion" 형태로 채워 보내면 컴포넌트 수정 없이 라벨 노출.
    const suggestions = parsed.map((s) => ({
      title: s.title,
      type:
        [s.pattern, s.emotion].filter(Boolean).join(" · ") || "정보성",
      pattern: s.pattern,
      emotion: s.emotion,
    }));

    return Response.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "제목 생성 실패";
    return Response.json(
      { suggestions: [], error: message },
      { status: 500 }
    );
  }
}
