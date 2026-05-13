/**
 * AEO 제목 생성 프롬프트.
 *
 * - 메인 키워드로 시작, 문장부호 0
 * - 작성자 신원(약사·엄마 등)을 클릭 유도 + 신뢰 신호로 활용
 * - 5개 이상 후보 JSON
 */
import type { AeoProfile, AeoTemplateId } from "@/types/aeo";
import { buildAeoContext } from "./aeo-context";
import { buildTopicSection, AEO_TITLE_RULES } from "./shared";

interface BuildTitlePromptOptions {
  profile: AeoProfile;
  template: AeoTemplateId;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  count?: number;
}

export function buildAeoTitlePrompt(opts: BuildTitlePromptOptions): string {
  const { profile, template, mainKeyword, subKeywords, topic, count = 5 } = opts;

  const templateHint =
    template === "informational"
      ? "정보성 글(원리·원인·해결법 설명). 후킹은 \"왜·어떻게·진짜 이유\" 류."
      : "비교·추천 글(여러 옵션 중 추천). 후킹은 \"TOP N·솔직히·진짜 추천\" 류 + 신뢰 신호.";

  const sections: string[] = [];

  sections.push(`당신은 AEO(Answer Engine Optimization) 블로그 제목을 짓는 전문 카피라이터입니다.
이 글은 AI(ChatGPT·Claude·Perplexity 등)가 사용자의 질문에 답할 때 인용 후보로 삼게 만드는 것이 목표입니다.
다음 작성자 프로필에 맞춰 ${count}개 이상의 제목 후보를 만들어주세요.`);

  sections.push(buildAeoContext(profile));

  sections.push(`[글 타입] ${template === "informational" ? "정보성글" : "비교·추천글"}
${templateHint}`);

  sections.push(`[메인 키워드] ${mainKeyword}`);
  if (subKeywords && subKeywords.trim()) {
    sections.push(`[보조 키워드] ${subKeywords}`);
  }

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  sections.push(AEO_TITLE_RULES);

  sections.push(`[AEO 제목 추가 가이드]
- 작성자 신원(예: "약사 출신 엄마")을 제목 어딘가에 자연스럽게 노출하면 클릭률 + 신뢰 신호 둘 다 강화됨
- 사용자가 AI에 던질 자연어 질문의 키워드("안전한", "추천", "어떤")를 한 번씩 활용
- 구체 수치 활용 권장 (TOP 5, 6개월, 200건)`);

  sections.push(`[출력 형식 — 절대 위반 금지]
JSON 배열만 출력. 설명·접두어·코드 블록 마커 X.
형식: [{"title": "제목 1", "type": "후킹 유형 한 단어"}, ...]
type 예시: "직답", "비교", "권위", "수치", "신뢰", "후킹"`);

  return sections.join("\n\n");
}
