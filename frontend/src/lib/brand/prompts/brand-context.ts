/**
 * 브랜드 프로필을 프롬프트 텍스트 블록으로 변환.
 *
 * - 모든 자유형 데이터를 LLM이 읽기 쉬운 한국어 마크다운 섹션으로 펼침
 * - 빈 항목은 자동 생략 (글 품질에 영향 X)
 */
import type { BrandProfile } from "@/types/brand";

const list = (items?: string[]): string =>
  items && items.length > 0 ? items.map((s) => `- ${s}`).join("\n") : "";

export function buildBrandContext(profile: BrandProfile): string {
  const sections: string[] = [];

  // 기본 정보
  sections.push(
    `[브랜드 기본 정보]
- 이름: ${profile.name}
- 카테고리: ${profile.category}
- 한 줄 소개: ${profile.oneLine}`
  );

  if (profile.coreValues?.length) {
    sections.push(`[핵심 가치]\n${list(profile.coreValues)}`);
  }

  // 인물
  if (profile.narrator?.name) {
    sections.push(
      `[1인칭 화자 (글의 주인공)]
- 이름: ${profile.narrator.name}
- 직책: ${profile.narrator.role}
- 권위/근거: ${profile.narrator.authority}
- 캐릭터: ${profile.narrator.character}`
    );
  }
  if (profile.supportingPersona?.name) {
    sections.push(
      `[주변 인물 (본문에 등장하지만 1인칭 X)]
- 이름: ${profile.supportingPersona.name}
- 직책: ${profile.supportingPersona.role}
- 권위/근거: ${profile.supportingPersona.authority}
- 캐릭터: ${profile.supportingPersona.character}
- 등장 방식: ${profile.supportingPersona.appearAs}`
    );
  }

  // 스토리
  if (profile.story && Object.values(profile.story).some(Boolean)) {
    sections.push(
      `[브랜드 스토리]
- 시작: ${profile.story.origin || ""}
- 위기: ${profile.story.crisis || ""}
- 부활: ${profile.story.revival || ""}
- 만남/결합: ${profile.story.encounter || ""}`
    );
  }

  // 에피소드
  if (profile.episodes?.length) {
    sections.push(
      `[실제 에피소드 (글에 자연스럽게 녹여낼 것)]
${profile.episodes.map((e) => `- [${e.type}] ${e.content}`).join("\n")}`
    );
  }

  // 권위 / 서비스
  if (profile.authorityAssets?.length) {
    sections.push(`[권위·신뢰 자산 (수치/근거로 활용)]\n${list(profile.authorityAssets)}`);
  }
  if (profile.services?.length) {
    sections.push(`[추가 서비스]\n${list(profile.services)}`);
  }

  // 타겟
  if (profile.targets) {
    const t = profile.targets;
    const lines: string[] = [];
    if (t.primary) lines.push(`- 주 타겟: ${t.primary}`);
    if (t.secondary) lines.push(`- 보조 타겟: ${t.secondary}`);
    if (t.tertiary) lines.push(`- 추가 타겟: ${t.tertiary}`);
    if (lines.length) sections.push(`[타겟 고객]\n${lines.join("\n")}`);
  }

  // 차별점·빌런·비유·시그니처
  if (profile.differentiators?.length) {
    sections.push(`[차별점]\n${list(profile.differentiators)}`);
  }
  if (profile.villains?.length) {
    sections.push(`[공통의 적 (자주 폭로하는 빌런)]\n${list(profile.villains)}`);
  }
  if (profile.metaphors?.length) {
    sections.push(`[자주 쓰는 비유]\n${list(profile.metaphors)}`);
  }
  if (profile.signaturePhrases?.length) {
    sections.push(`[시그니처 표현 — 본문에서 자연스럽게 활용 권장]\n${list(profile.signaturePhrases)}`);
  }

  // 추천 코스
  if (profile.recommendedRoutes?.length) {
    sections.push(`[추천 코스/상품]\n${list(profile.recommendedRoutes)}`);
  }

  // CTA
  if (profile.cta?.channels?.length) {
    sections.push(
      `[CTA — 글 끝에서 자연스럽게 유도할 채널]\n${list(profile.cta.channels)}`
    );
  }

  // 금기
  const forbiddenLines: string[] = [];
  if (profile.forbidden?.competitorNames) {
    forbiddenLines.push("- 경쟁사 실명 절대 노출 금지 (\"대형 여행사\", \"일부 업체\" 등으로 치환)");
  }
  if (profile.forbidden?.adStyle) {
    forbiddenLines.push("- 광고 직접 표현 금지 (\"꼭 사세요\", \"지금 결제\" 류)");
  }
  if (profile.forbidden?.forbiddenWords?.length) {
    forbiddenLines.push(
      `- 다음 단어는 본문에 절대 노출 금지: ${profile.forbidden.forbiddenWords.join(", ")}`
    );
  }
  if (forbiddenLines.length) {
    sections.push(`[금기 — 글에 절대 등장 X]\n${forbiddenLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * 익명 브랜드 컨텍스트 — 정보성글 전용 (브랜드 노출 차단).
 *
 * 이유: buildBrandContext는 회사명·인물명·시그니처 표현·자랑 통계까지 풍부하게 주입해서
 * LLM이 본문에 자꾸 박는다. 정보성글에서는 도메인 카테고리와 글 쓰기 룰(금기)만 추출하고,
 * 브랜드 식별자는 모두 차단한다.
 *
 * 활용 가능: 카테고리(도메인 식별), 빌런(공통의 적), 금기(글 룰)
 * 차단: 이름·인물·스토리·에피소드·자산·차별점·비유·시그니처·CTA 채널·추천 코스
 *
 * 후기성·소개·가치입증·상세 모드는 영향 없음 (해당 모드는 buildBrandContext 그대로 사용).
 */
export function buildAnonymousBrandContext(profile: BrandProfile): string {
  const sections: string[] = [];

  sections.push(
    `[글 카테고리 — 도메인 식별용]
- 이 글은 "${profile.category}" 도메인의 정보성글입니다.
- 도메인 지식·시장 통찰·업계 관행은 본문에 활용하되, 자사 식별 정보(회사명·인물명·서비스명·시그니처 표현)는 본문에 절대 노출하지 않습니다.`
  );

  // 공통의 적 — 도메인 폭로 톤에 필요. 단, 경쟁사 실명 등이 박혀있으면 그 줄은 제외.
  if (profile.villains?.length) {
    const safeVillains = profile.villains.filter(
      (v) => !profile.forbidden?.competitorNames || !/주식회사|\(주\)/.test(v)
    );
    if (safeVillains.length) {
      sections.push(
        `[공통의 적 — 폭로 대상으로 활용 가능]\n${safeVillains.map((s) => `- ${s}`).join("\n")}`
      );
    }
  }

  // 금기 룰 — 글 전체 룰이라 그대로 유지
  const forbiddenLines: string[] = [];
  if (profile.forbidden?.competitorNames) {
    forbiddenLines.push(
      "- 경쟁사 실명 절대 노출 금지 (\"대형 여행사\", \"일부 업체\" 등으로 치환)"
    );
  }
  if (profile.forbidden?.adStyle) {
    forbiddenLines.push(
      "- 광고 직접 표현 금지 (\"꼭 사세요\", \"지금 결제\", CTA 링크 직접 박기 류)"
    );
  }
  if (profile.forbidden?.forbiddenWords?.length) {
    forbiddenLines.push(
      `- 다음 단어는 본문에 절대 노출 금지: ${profile.forbidden.forbiddenWords.join(", ")}`
    );
  }
  if (forbiddenLines.length) {
    sections.push(`[금기 — 글에 절대 등장 X]\n${forbiddenLines.join("\n")}`);
  }

  return sections.join("\n\n");
}
