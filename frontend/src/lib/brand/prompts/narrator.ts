/**
 * 화자 고정 규칙 — 윤희 이사 1인칭, 임두환 대표는 주변 인물로만.
 *
 * - 소개글(intro)만 예외: 두 인물이 각자 섹션을 가질 수 있음.
 * - 그 외 템플릿은 윤희 1인칭 + 임두환 언급 형태.
 */
import type { BrandProfile } from "@/types/brand";
import type { BrandTemplateId } from "@/types/brand";

export function buildNarratorRule(profile: BrandProfile, template: BrandTemplateId): string {
  const narrator = profile.narrator;
  const supporting = profile.supportingPersona;

  const isIntro = template === "intro";

  if (isIntro && supporting?.name) {
    return `[화자 규칙]
이 글은 두 인물이 각자 섹션을 가지며 결합되는 Origin Story 형식입니다.

- 1인칭 화자 1: ${narrator.name} (${narrator.role})
  · 권위 근거: ${narrator.authority}
  · 캐릭터: ${narrator.character}
- 1인칭 화자 2: ${supporting.name} (${supporting.role})
  · 권위 근거: ${supporting.authority}
  · 캐릭터: ${supporting.character}

각 섹션 안에서는 해당 화자의 1인칭 시점("저는…")으로 서술하고,
다른 화자는 3인칭으로 자연스럽게 언급합니다 ("${supporting.name} 대표는…").
두 인물이 만나 결합되는 흐름은 본문 후반에서 마무리됩니다.`;
  }

  // intro 외 — 윤희 1인칭 고정
  const supportingMention = supporting?.name
    ? `\n- 보조 인물 ${supporting.name}(${supporting.role})은 본문 안에서 3인칭으로 언급될 수 있습니다 ("${supporting.name} 대표가…", "${supporting.name} 대표의 ${supporting.authority}…"). 화자 위치에 절대 두지 마세요.`
    : "";

  return `[화자 규칙 — 절대 위반 금지]
- 1인칭 화자: ${narrator.name} (${narrator.role})
  · 권위 근거: ${narrator.authority}
  · 캐릭터: ${narrator.character}
- 모든 1인칭 표현("저는", "제가", "저희가")은 ${narrator.name}을(를) 가리킵니다.${supportingMention}
- 화자가 도중에 바뀌지 않습니다.`;
}
