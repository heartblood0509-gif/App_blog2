/**
 * SEO·AEO 통합형 제목 생성 프롬프트.
 *
 * - 사용자가 실제로 검색하거나 AI에게 질문할 법한 자연어 질문 형태
 * - AEO 프로필의 한 줄 소개·타겟 독자를 살짝 반영 (제목에 이름 명시 X)
 * - 5개 후보 생성 → 클라이언트가 사용자에게 선택지로 보여줌
 */
import type { AeoProfile } from "@/types/aeo";
import {
  buildIntentTitleOverlay,
  type SeoAeoIntentType,
} from "../templates";

export interface BuildSeoAeoTitlePromptOptions {
  profile: AeoProfile;
  topic?: string | null;
  mainKeyword: string;
  subKeywords?: string;
  requirements?: string;
  count?: number;
}

export function buildSeoAeoTitlePrompt(
  opts: BuildSeoAeoTitlePromptOptions
): string {
  const { profile, topic, mainKeyword, subKeywords, requirements, count = 5 } = opts;

  const topicLine = topic?.trim() ? `주제: ${topic.trim()}` : "주제: (자동 추론)";
  const subLine = subKeywords?.trim() ? `보조 키워드: ${subKeywords.trim()}` : "보조 키워드: (없음)";
  const reqLine = requirements?.trim()
    ? `반드시 포함할 내용: ${requirements.trim()}`
    : "";

  const profileHint = `[작성자 컨텍스트 — 제목 톤에 살짝 반영]
- 한 줄 소개: ${profile.oneLineIntro || "(없음)"}
- 타겟 독자: ${profile.audience || "(없음)"}
- 분야: ${profile.category || "(없음)"}
※ 제목 안에 작성자 이름은 명시하지 않습니다. 다만 타겟 독자가 실제로 검색할 법한 어휘·말투를 자연스럽게 반영합니다.`;

  return `너는 SEO와 AEO를 모두 고려하는 블로그 제목 카피라이터다.

이 글은 검색 엔진 노출과 AI 답변 엔진(ChatGPT·Claude·Perplexity) 인용 가능성을 동시에 노린다.

${profileHint}

[입력 정보]
${topicLine}
핵심 키워드: ${mainKeyword}
${subLine}
${reqLine}

[제목 작성 규칙]
1. 사용자가 실제로 검색하거나 AI에게 질문할 법한 **질문형 제목**으로 작성한다.
2. 핵심 키워드를 자연스럽게 포함한다 (제목 앞쪽일수록 좋음).
3. 클릭 후킹과 정보성 신뢰감을 모두 살린다.
4. 마침표·느낌표·과한 이모지는 사용하지 않는다. 물음표는 허용된다.
5. 한국어 자연어 문장 형태 (검색 키워드 나열형 X).
6. 너무 길지 않게 — 모바일 검색결과에서 잘리지 않는 길이 (대략 25~45자).
7. 5개 모두 서로 다른 각도/패턴으로 작성한다.

[제목 패턴 예시]
- 직접 질문형: "임산부 탈모샴푸, 어떤 성분을 피해야 할까요?"
- 비교 질문형: "임산부 탈모샴푸 vs 일반 탈모샴푸, 뭐가 다를까요?"
- 실수 방지형: "임산부 탈모샴푸 고를 때 흔히 하는 실수는?"
- 초보 안내형: "임신 중 처음 탈모샴푸를 쓴다면 무엇부터 확인할까요?"
- 기준 정리형: "임산부 안전 탈모샴푸를 고르는 3가지 기준은?"

[출력 형식]
JSON 배열로만 출력. 다른 설명 금지.
[
  { "title": "질문형 제목 1" },
  { "title": "질문형 제목 2" },
  { "title": "질문형 제목 3" },
  { "title": "질문형 제목 4" },
  { "title": "질문형 제목 5" }
]

정확히 ${count}개를 생성한다.
`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent Mode 전용 제목 프롬프트.
// 5개 후보를 선택된 의도의 각도 안에서만 변주.
// 기존 buildSeoAeoTitlePrompt 는 손대지 않음 (auto 경로 회귀 0 보호).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BuildSeoAeoIntentTitlePromptOptions
  extends BuildSeoAeoTitlePromptOptions {
  intent: SeoAeoIntentType;
}

export function buildSeoAeoIntentTitlePrompt(
  opts: BuildSeoAeoIntentTitlePromptOptions
): string {
  const { profile, topic, mainKeyword, subKeywords, requirements, count = 5, intent } = opts;
  const titleOverlay = buildIntentTitleOverlay(intent);

  const topicLine = topic?.trim() ? `주제: ${topic.trim()}` : "주제: (자동 추론)";
  const subLine = subKeywords?.trim() ? `보조 키워드: ${subKeywords.trim()}` : "보조 키워드: (없음)";
  const reqLine = requirements?.trim()
    ? `반드시 포함할 내용: ${requirements.trim()}`
    : "";

  const profileHint = `[작성자 컨텍스트 — 제목 톤에 살짝 반영]
- 한 줄 소개: ${profile.oneLineIntro || "(없음)"}
- 타겟 독자: ${profile.audience || "(없음)"}
- 분야: ${profile.category || "(없음)"}
※ 제목 안에 작성자 이름은 명시하지 않습니다. 다만 타겟 독자가 실제로 검색할 법한 어휘·말투를 자연스럽게 반영합니다.`;

  return `너는 SEO와 AEO를 모두 고려하는 블로그 제목 카피라이터다.

이 글은 검색 엔진 노출과 AI 답변 엔진(ChatGPT·Claude·Perplexity) 인용 가능성을 동시에 노린다.

${profileHint}

[입력 정보]
${topicLine}
핵심 키워드: ${mainKeyword}
${subLine}
${reqLine}

[이번 글의 의도 — 제목 5개 모두 이 각도 안에서만 변주]
${titleOverlay}

[제목 작성 규칙]
1. 사용자가 실제로 검색하거나 AI에게 질문할 법한 **질문형 제목**으로 작성한다.
2. 핵심 키워드를 자연스럽게 포함한다 (제목 앞쪽일수록 좋음).
3. 클릭 후킹과 정보성 신뢰감을 모두 살린다.
4. 마침표·느낌표·과한 이모지는 사용하지 않는다. 물음표는 허용된다.
5. 한국어 자연어 문장 형태 (검색 키워드 나열형 X).
6. 너무 길지 않게 — 모바일 검색결과에서 잘리지 않는 길이 (대략 25~45자).
7. 5개 모두 서로 다른 변주이되, 위 의도 각도를 벗어나지 않는다.

[출력 형식]
JSON 배열로만 출력. 다른 설명 금지.
[
  { "title": "질문형 제목 1" },
  { "title": "질문형 제목 2" },
  { "title": "질문형 제목 3" },
  { "title": "질문형 제목 4" },
  { "title": "질문형 제목 5" }
]

정확히 ${count}개를 생성한다.
`;
}
