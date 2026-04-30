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
