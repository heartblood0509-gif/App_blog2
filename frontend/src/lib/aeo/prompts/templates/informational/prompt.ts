/**
 * 정보성글 프롬프트 빌더.
 *
 * 골격:
 *   [직답 박스] → [왜 중요한가] → [원인·원리 분석] → [해결법 단계별]
 *   → [FAQ 3~5개] → [주의·비추천] → [정리·결론]
 */
import type { AeoProfile } from "@/types/aeo";
import { buildAeoContext } from "../../aeo-context";
import {
  buildAeoSharedRules,
  buildTopicSection,
  buildTargetQueriesSection,
  buildSourcesSection,
  buildCharCountSection,
  buildRequirementsSection,
} from "../../shared";
import { INFORMATIONAL_REFERENCE } from "./reference";

export interface BuildInformationalPromptOptions {
  profile: AeoProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  requirements?: string;
  charCount: { min: number; max: number };
  targetQueries?: string[];
  sources?: Array<{ url?: string; note?: string }>;
}

const INFORMATIONAL_SKELETON = `[정보성글 골격 — 권장 구조]

다음 순서로 본문을 구성하라. 각 구간은 권장이지만, 직답·구체 수치·FAQ는 필수다.

1. <HOOK> 블록 (1~2 문장, 후킹 + 신뢰 신호)

2. 직답 박스 (HOOK 다음 첫 단락)
   - 한 문장 결론으로 시작 ("결론부터 말씀드리면, ~")
   - 작성자 신원·근거 짧게 (1~2 문장)

3. ##{postit} 왜 중요한가 (배경)
   - 구체 수치 1개 이상 (예: "국내 ${"\\${X}"}% 가 ${"\\${Y}"}")
   - 권위 출처 1회 인용 가능하면

4. ##{postit} 원인·원리 분석 (핵심 본문)
   - 단계·요인 N가지로 정리 (3~5개 권장)
   - 구체 수치 2개 이상 추가 (전체 본문 누계 3+개)

5. ##{postit} 해결법·관리법
   - 번호 매긴 단계 또는 시기·상황별 구분
   - 작성자 신원의 직접 경험 1회 자연스럽게 녹임

6. ##{postit} FAQ
   - Q&A 3~5개. AI가 그대로 발췌할 수 있게 작성
   - Q는 자연어 질문, A는 80~150자 직답

7. (선택) 주의·비추천 대상
   - 솔직히 명시. 신뢰 신호.

8. ##{underline} 정리·결론
   - 핵심 1~3줄로 다시 강조`;

export function buildInformationalPrompt(opts: BuildInformationalPromptOptions): string {
  const {
    profile,
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    requirements,
    charCount,
    targetQueries,
    sources,
  } = opts;

  const sections: string[] = [];

  sections.push(`당신은 AEO(Answer Engine Optimization) 정보성 블로그 글을 작성하는 전문 에디터입니다.
이 글의 목표는 사람이 끝까지 읽게 하는 것이 아니라, **AI(ChatGPT·Claude·Perplexity 등)가 사용자의 질문에 답할 때 인용 후보로 삼게 만드는 것**입니다.
아래 프로필·키워드·골격을 따라 마크다운 본문을 작성하세요.`);

  sections.push(buildAeoContext(profile));

  sections.push(`[선택된 제목]
${selectedTitle}

본문은 이 제목이 약속하는 답을 정확히 전달해야 합니다.`);

  sections.push(`[메인 키워드] ${mainKeyword}`);
  if (subKeywords && subKeywords.trim()) {
    sections.push(`[보조 키워드] ${subKeywords}`);
  }

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  const targetQueriesSection = buildTargetQueriesSection(targetQueries);
  if (targetQueriesSection) sections.push(targetQueriesSection);

  const sourcesSection = buildSourcesSection(sources);
  if (sourcesSection) sections.push(sourcesSection);

  sections.push(INFORMATIONAL_SKELETON);

  sections.push(`[참고 레퍼런스 — 톤·구조 학습용. 본문 복제 금지]
다음은 AEO 친화 정보성글의 톤·구조 예시입니다. **본문 자체는 절대 베끼지 말고**, 직답 첫 문단·구체 수치·FAQ 등의 구조만 학습해서 새 도메인(메인 키워드)으로 다시 쓰세요.

\`\`\`
${INFORMATIONAL_REFERENCE}
\`\`\``);

  const requirementsSection = buildRequirementsSection(requirements);
  if (requirementsSection) sections.push(requirementsSection);

  sections.push(buildCharCountSection(charCount));

  sections.push(buildAeoSharedRules());

  return sections.join("\n\n");
}
