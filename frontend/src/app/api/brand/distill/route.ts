/**
 * 브랜드 프로필 → 정보 명제 추출 API (Distill).
 *
 * 정보성글 본문 생성 직전에 호출. 결과(propositions)는 page.tsx 측에서 캐싱하여
 * 같은 (profileId + mainKeyword) 조합이면 재사용한다.
 *
 * 입력: { profile, mainKeyword, subKeywords?, topic?, apiKey? }
 * 출력: { propositions: BrandProposition[], cacheKey: string }
 */
import { buildDistillPrompt, detectBrandLeakInProposition } from "@/lib/brand/prompts/distill";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";
import type { BrandProfile, BrandProposition } from "@/types/brand";

export const maxDuration = 60;

interface DistillBody {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  apiKey?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DistillBody;
    const { profile, mainKeyword, subKeywords, topic, apiKey } = body;

    if (!profile || !mainKeyword) {
      return Response.json(
        { error: "필수 입력이 누락되었습니다 (profile, mainKeyword)." },
        { status: 400 }
      );
    }

    const prompt = buildDistillPrompt({ profile, mainKeyword, subKeywords, topic });

    // 1차 추출 — Pro 모델로 정확도 확보 (analyze 패턴 답습)
    let propositions = await callAndParse(prompt, apiKey);

    // 검증 게이트 — 명제에 회사명·인물명이 그대로 박혔으면 해당 명제만 제거
    propositions = propositions.filter((p) => {
      const leaks = detectBrandLeakInProposition(p, profile);
      return leaks.length === 0;
    });

    // 명제가 너무 적게 남았으면 재시도 1회
    if (propositions.length < 3) {
      const retried = await callAndParse(prompt, apiKey);
      const cleaned = retried.filter((p) => detectBrandLeakInProposition(p, profile).length === 0);
      // 재시도 결과가 더 풍성하면 채택
      if (cleaned.length > propositions.length) propositions = cleaned;
    }

    if (propositions.length === 0) {
      return Response.json(
        { error: "정보 명제 추출에 실패했습니다. 브랜드 프로필이 비어있거나 키워드와 무관할 수 있습니다." },
        { status: 500 }
      );
    }

    const cacheKey = `${profile.id}:${mainKeyword}`;
    return Response.json({ propositions, cacheKey });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "정보 명제 추출 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function callAndParse(prompt: string, apiKey?: string): Promise<BrandProposition[]> {
  const raw = await generateText(prompt, CONFIG.ANALYSIS_MODEL, apiKey);
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error("응답 형식이 올바르지 않습니다 (JSON 배열이어야 함).");
  }
  // 형식 검증
  return parsed
    .filter(
      (p): p is BrandProposition =>
        typeof p?.statement === "string" &&
        typeof p?.evidence === "string" &&
        typeof p?.source === "string"
    )
    .slice(0, 10);
}
