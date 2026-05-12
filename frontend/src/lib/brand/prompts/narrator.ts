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

/**
 * 익명 전문가 화자 룰 — 정보성글 전용 (브랜드 노출 차단).
 *
 * 이유: 정보성글은 "브랜드 직접 언급 X"가 본질이라 화자 이름·소속·자사 1인칭 표현이
 * 본문에 새 나가면 글 가치가 깨진다. 익명 업계 전문가 톤으로 고정한다.
 *
 * 후기성·소개·가치입증·상세 모드는 영향 없음 (해당 모드는 buildNarratorRule 그대로 사용).
 */
export function buildAnonymousNarratorRule(): string {
  return `[화자 규칙 — 익명 전문가 모드 (정보성글 전용 · 절대 위반 금지)]
- 1인칭 화자: 익명의 업계 전문가 (이름·소속·직책 모두 비공개)
- 모든 1인칭 표현("저는", "제가")은 화자 본인을 가리키되, 출처가 어느 회사·인물인지 추적할 수 없게 작성한다.
- 다음 표현은 본문에 절대 등장 금지:
  · "저희가", "저희 회사", "저희 고객", "저희의 ○○" — 자사 1인칭 일체 금지
  · 화자 실명·동료 실명·대표 실명·직책명
  · 회사명·서비스명·자사 시그니처 표현
- 권위 표현은 익명 톤으로:
  · ❌ "○○ 대표는 14년 경력의 베테랑으로서…"
  · ✅ "이 업계 14년 경력자로서…", "이 시장을 오래 들여다본 사람으로서…"
- 일화·사례는 인명 없이 익명화:
  · ❌ "저희 고객 김 여사님이…"
  · ✅ "한 고객님이…", "예전에 만났던 분이…"
- 화자가 도중에 바뀌지 않는다. 다른 인물(보조 인물)도 본문에 등장시키지 않는다.`;
}
