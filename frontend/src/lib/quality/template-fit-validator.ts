/**
 * 템플릿 ↔ 주제 적합성 검증기 (검문소).
 *
 * - Gemini 호출 → JSON 파싱 → 안전 폴백.
 * - 신뢰도(confidence) 임계치 미만이면 호출자가 통과시켜야 한다.
 * - 어떤 예외가 나도 글 생성 자체는 막지 않도록 polite-fail.
 */
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import {
  buildTemplateFitPrompt,
  shouldRunFitCheck,
  type TemplateFitInput,
} from "@/lib/brand/prompts/template-fit";

export interface TemplateFitResult {
  /** true면 통과, false면 미스매치 의심 */
  match: boolean;
  /** 0.0 ~ 1.0. 호출부에서 임계치 비교 */
  confidence: number;
  /** 사용자에게 보여줄 짧은 이유 */
  reason: string;
  /** 미스매치일 때만 — 서로 각도가 다른 대체 주제 후보 (최대 3개) */
  suggestions: string[];
  /** true면 검증을 수행하지 않음 ("내 템플릿 만들기" 등) */
  skipped?: boolean;
}

/**
 * 검증 미수행 시 반환하는 안전 통과 결과.
 */
function passThrough(reason: string): TemplateFitResult {
  return {
    match: true,
    confidence: 0,
    reason,
    suggestions: [],
    skipped: true,
  };
}

/**
 * Gemini 응답에서 JSON 객체를 안전하게 추출.
 * 모델이 코드블록(```json ... ```)으로 감싸 보내는 경우도 대응.
 */
function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // 코드블록 제거
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  // 첫 { 부터 마지막 } 까지만
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * 검문소 메인 진입점.
 * 어떤 오류든 안전 통과(skipped=true)를 반환한다 — 글 생성 자체를 막지 않기 위함.
 */
export async function checkTemplateFit(
  input: TemplateFitInput,
  apiKey?: string
): Promise<TemplateFitResult> {
  if (!shouldRunFitCheck(input)) {
    return passThrough("검증 대상 아님 (내 템플릿 만들기 등)");
  }

  let raw = "";
  try {
    const prompt = buildTemplateFitPrompt(input);
    // Flash 사용. Pro는 분석엔 정확하지만 16초나 걸려 UX 파괴.
    // 검문소는 단순 분류 작업이라 Flash로도 충분 (2~3초).
    raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);
  } catch (err) {
    // 네트워크/쿼터/키 오류 — 글 생성 막지 않고 통과
    const msg = err instanceof Error ? err.message : String(err);
    return passThrough(`Gemini 호출 실패: ${msg}`);
  }

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return passThrough("응답 JSON 파싱 실패");
  }

  const obj = parsed as Record<string, unknown>;
  const match = typeof obj.match === "boolean" ? obj.match : true;
  const confidence = clampConfidence(obj.confidence);
  const reason =
    typeof obj.reason === "string" ? obj.reason.slice(0, 500) : "";

  // suggestions 배열 정상 케이스
  let suggestions: string[] = [];
  if (Array.isArray(obj.suggestions)) {
    suggestions = obj.suggestions
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim().slice(0, 200))
      .filter((s) => s.length > 0)
      .slice(0, 3);
  } else if (typeof obj.suggestion === "string") {
    // 구버전 단일 suggestion 호환 폴백
    const single = obj.suggestion.trim();
    if (single) suggestions = [single.slice(0, 200)];
  }

  return { match, confidence, reason, suggestions };
}
