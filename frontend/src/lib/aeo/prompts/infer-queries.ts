/**
 * 타겟 자연어 질문 추론 프롬프트.
 *
 * 입력: 프로필 + 메인 키워드 + 부가 컨텍스트
 * 출력: 사용자가 ChatGPT/Claude/Perplexity 등 AI에게 실제로 던질 법한
 *       자연어 질문 N개 (기본 5개)
 *
 * 추론 결과를 사용자가 체크박스 UI에서 선택/추가 후, 본문 생성 프롬프트에
 * "이 질문들 모두에 답해야 한다"는 지시로 주입된다.
 */
import type { AeoProfile } from "@/types/aeo";
import { buildAeoContext } from "./aeo-context";

interface BuildInferQueriesPromptOptions {
  profile: AeoProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  count?: number;
}

export function buildInferQueriesPrompt(opts: BuildInferQueriesPromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const sections: string[] = [];

  sections.push(`당신은 사용자가 AI(ChatGPT·Claude·Perplexity 등)에게 실제로 어떻게 질문하는지 잘 아는 검색 행동 분석가입니다.

다음 프로필·키워드를 보고, **이 글이 답해야 할 자연어 질문 ${count}개**를 도출하세요.

이 질문들은:
- 검색 키워드형이 아니라 **자연스러운 한국어 문장 형태**여야 합니다.
- 프로필의 [독자]가 진짜 AI에게 던질 만한 표현이어야 합니다.
- 메인 키워드와 직접 관련된 질문이어야 합니다 (너무 막연한 질문 X).
- 서로 다른 각도로 N개 (단순 표현 변형 X).`);

  sections.push(buildAeoContext(profile));

  sections.push(`[메인 키워드] ${mainKeyword}`);
  if (subKeywords && subKeywords.trim()) {
    sections.push(`[보조 키워드] ${subKeywords}`);
  }
  if (topic && topic.trim()) {
    sections.push(`[주제] ${topic.trim()}`);
  }

  sections.push(`[좋은 질문 예시 (이 결의 표현)]
- "임산부도 안전한 탈모 샴푸 좀 추천해주세요"
- "임신 6개월차인데 머리가 너무 빠져요. 어떤 샴푸 써야 해요?"
- "수유 중에도 써도 되는 탈모 샴푸가 있을까요?"
- "산후 탈모는 언제까지 가나요?"
- "임산부 탈모 호르몬 때문이라는데 진짜인가요?"

[나쁜 질문 예시 (이런 결은 피할 것)]
- "임산부 탈모 샴푸 효과"          ← 검색 키워드형
- "탈모"                          ← 너무 짧고 막연
- "탈모 샴푸 추천"                ← 일반론, 프로필 독자와 무관`);

  sections.push(`[출력 형식 — 절대 위반 금지]
JSON 배열만 출력. 설명·접두어·코드 블록 마커 X.
형식: ["질문 1", "질문 2", ...]
배열 길이는 정확히 ${count}.`);

  return sections.join("\n\n");
}
