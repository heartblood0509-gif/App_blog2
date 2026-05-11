/**
 * AEO 템플릿 ↔ 주제 적합성 검증기.
 *
 * 브랜드 검증기(lib/quality/template-fit-validator.ts)의 패턴을 미러.
 * - Gemini 호출 → JSON 파싱 → 안전 폴백
 * - 어떤 예외도 글 생성을 막지 않도록 polite-fail.
 */
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import {
  buildAeoTemplateFitPrompt,
  shouldRunAeoFitCheck,
  type AeoTemplateFitInput,
} from "@/lib/aeo/prompts/template-fit";

export interface AeoTemplateFitResult {
  match: boolean;
  confidence: number;
  reason: string;
  suggestions: string[];
  skipped?: boolean;
}

function passThrough(reason: string): AeoTemplateFitResult {
  return {
    match: true,
    confidence: 0,
    reason,
    suggestions: [],
    skipped: true,
  };
}

function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
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

export async function checkAeoTemplateFit(
  input: AeoTemplateFitInput,
  apiKey?: string
): Promise<AeoTemplateFitResult> {
  if (!shouldRunAeoFitCheck(input)) {
    return passThrough("검증 대상 아님");
  }

  let raw = "";
  try {
    const prompt = buildAeoTemplateFitPrompt(input);
    raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey);
  } catch (err) {
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

  let suggestions: string[] = [];
  if (Array.isArray(obj.suggestions)) {
    suggestions = obj.suggestions
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim().slice(0, 200))
      .filter((s) => s.length > 0)
      .slice(0, 3);
  }

  return { match, confidence, reason, suggestions };
}
