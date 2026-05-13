/**
 * AEO 프로필을 프롬프트 텍스트 블록으로 변환.
 *
 * 브랜드 컨텍스트가 "스토리·인물" 중심이라면, AEO 컨텍스트는
 * "권위·신뢰·인용 가능성" 중심으로 구성된다.
 *
 * - 모든 자유형 데이터를 LLM이 읽기 쉬운 한국어 마크다운 섹션으로 펼침
 * - 빈 항목은 자동 생략
 */
import type { AeoProfile } from "@/types/aeo";

const list = (items?: string[]): string =>
  items && items.length > 0 ? items.map((s) => `- ${s}`).join("\n") : "";

const numberedList = (items?: string[]): string =>
  items && items.length > 0
    ? items.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "";

export function buildAeoContext(profile: AeoProfile): string {
  const sections: string[] = [];

  // 기본 정보 + 한 줄 소개 = AI 인용 목표
  sections.push(
    `[작성자(프로필) 기본 정보]
- 프로필 이름: ${profile.name}
- 카테고리·분야: ${profile.category}
- 한 줄 소개 (AI가 우릴 기억할 모습): ${profile.oneLineIntro}`
  );

  // 작성자 신원 = E-E-A-T의 Experience + Expertise
  const idLines: string[] = [];
  if (profile.identity?.experience) {
    idLines.push(`- 직접 경험: ${profile.identity.experience}`);
  }
  if (profile.identity?.credentials?.length) {
    idLines.push(`- 자격·경력:\n${profile.identity.credentials.map((s) => `  · ${s}`).join("\n")}`);
  }
  if (idLines.length) {
    sections.push(`[작성자 신원 — 글 안에서 신뢰의 근거로 자연스럽게 드러내라]\n${idLines.join("\n")}`);
  }

  // 타겟 독자
  if (profile.audience) {
    sections.push(
      `[독자 — 이 글이 도움 줄 사람]
${profile.audience}

위 독자의 구체적 상황·고민을 본문에 반영하라. 일반론이 아니라 이 독자의 언어로 말하라.`
    );
  }

  // 추천 기준 (배열 순서 = 우선순위)
  if (profile.recommendationCriteria?.length) {
    sections.push(
      `[추천 기준 — 위→아래가 우선순위. 본문에 명시적으로 드러내라]
${numberedList(profile.recommendationCriteria)}

비교·추천 글이라면 이 순서대로 따져본 결과를 본문에 보여주어라. 정보성 글이라면 이 기준이 왜 중요한지 곳곳에 녹여라.`
    );
  }

  // 자주 인용하는 출처 (Authoritativeness)
  if (profile.trustedSources?.length) {
    sections.push(
      `[자주 인용하는 권위 출처]
${list(profile.trustedSources)}

본문에서 가능하면 "○○에 따르면", "○○ 기준" 같은 표현으로 1회 이상 자연스럽게 인용하라.`
    );
  }

  // 금기
  if (profile.forbidden?.enabled && profile.forbidden.words?.length) {
    sections.push(
      `[금기 — 본문에 절대 등장 X]
다음 단어들은 의료·법적 단정으로 해석될 수 있어 절대 노출 금지:
${profile.forbidden.words.map((w) => `- ${w}`).join("\n")}`
    );
  }

  return sections.join("\n\n");
}
