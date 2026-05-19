/**
 * 브랜드 글 품질 검증 API.
 *
 * 후기성 검증기(`validateContent`)를 베이스로,
 * 정보성글(template === "info")일 때만 추가 검증 — 회사명·인물명·자산이 본문에 등장하면 실패 처리.
 * intro/value-proof/detail은 추가 검증 미적용 (직접 노출이 정상이므로).
 */
import { validateContent } from "@/lib/quality/validator";
import type { BrandProfile, BrandTemplateId } from "@/types/brand";
import type { QualityResult } from "@/types";

interface ValidateBody {
  text: string;
  keyword: string;
  charRange?: { min: number; max: number };
  /** 정보성글 분기 검증을 위한 컨텍스트 — 누락 시 추가 검증 skip */
  template?: BrandTemplateId;
  profile?: BrandProfile;
}

/**
 * 정보성글 한정 — 본문에 브랜드 자산이 그대로 등장했는지 검출.
 * 검출되면 failReasons에 항목 추가.
 */
function detectBrandExposure(text: string, profile: BrandProfile): string[] {
  // v2: label, supportingPersona, signaturePhrases 제거됨.
  //     남은 검사 대상은 회사명·1인칭 화자명만.
  const reasons: string[] = [];
  const checks: Array<{ word: string; label: string }> = [];

  if (profile.name) checks.push({ word: profile.name, label: "회사명" });
  if (profile.narrator?.name) {
    checks.push({ word: profile.narrator.name, label: "1인칭 화자명" });
  }

  for (const { word, label } of checks) {
    if (!word) continue;
    if (text.includes(word)) {
      reasons.push(`${label} 노출: "${word}" (정보성글에서는 0건이어야 함)`);
    }
  }

  return reasons;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ValidateBody;
    const { text, keyword, charRange, template, profile } = body;

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

    // 정보성글이면 브랜드 노출 검증을 얹는다 (intro/value-proof/detail은 skip)
    if (template === "info" && profile) {
      const exposureReasons = detectBrandExposure(text, profile);
      if (exposureReasons.length > 0) {
        const augmented: QualityResult = {
          ...result,
          failReasons: [...result.failReasons, ...exposureReasons],
          isPass: false,
        };
        return Response.json(augmented);
      }
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "브랜드 글 검증 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
