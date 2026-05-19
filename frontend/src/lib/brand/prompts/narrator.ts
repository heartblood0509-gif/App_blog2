/**
 * 화자 고정 규칙 — 1인칭 화자(글쓴이) 1명.
 *
 * v2: 보조 인물(supportingPersona) 제거됨. 모든 템플릿이 1인칭 화자 단일 구조.
 *     character(성격) 필드도 제거됨.
 */
import type { BrandProfile } from "@/types/brand";
import type { BrandTemplateId } from "@/types/brand";

/** narrator.authority(여러 줄 string)를 화자 규칙용으로 렌더링. */
function renderAuthority(authority?: string): string {
  const lines = (authority || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return ` ${lines[0]}`;
  return "\n  " + lines.map((s) => `· ${s}`).join("\n  ");
}

export function buildNarratorRule(profile: BrandProfile, _template: BrandTemplateId): string {
  const narrator = profile.narrator;
  return `[화자 규칙 — 절대 위반 금지]
- 1인칭 화자: ${narrator.name} (${narrator.role})
  · 권위 근거:${renderAuthority(narrator.authority)}
- 모든 1인칭 표현("저는", "제가", "저희가")은 ${narrator.name}을(를) 가리킵니다.
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

/** 하위 호환: 기존 info-5/info-custom/fix 프롬프트에서 사용하던 이름. */
export function buildAnonymousExpertNarrator(): string {
  return buildAnonymousNarratorRule();
}
