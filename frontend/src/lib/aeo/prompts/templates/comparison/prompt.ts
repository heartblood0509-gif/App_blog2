/**
 * 비교·추천글 프롬프트 빌더.
 *
 * 골격:
 *   [직답 박스] → [선정 기준] → [📊 비교표 이미지] → [제품별 카드 5개 (>postit>)]
 *   → [상황별 추천 매트릭스] → [비추천 케이스] → [FAQ] → [정리·결론]
 *
 * 핵심: 비교표는 마크다운 테이블 절대 X. 표 이미지 마커 1개 + 카드형 인용구로 표현.
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
import { COMPARISON_REFERENCE } from "./reference";

export interface BuildComparisonPromptOptions {
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

const COMPARISON_SKELETON = `[비교·추천글 골격 — 권장 구조]

⚠ 결정적 주의: **마크다운 표(\`| A | B |\`) 절대 사용 금지**. 네이버 SmartEditor가 마크다운 테이블을 지원하지 않아 발행 시 깨진다. 대신 "비교표 이미지 마커 1개 + 카드형 인용구 5개"로 표현하라.

1. <HOOK> 블록

2. 직답 박스 (HOOK 다음 첫 단락)
   - 결론 한 문장 ("결론: A 상황엔 X, B 상황엔 Y")
   - 작성자 신원·근거 + 비교 기준 명시

3. ##{postit} 선정 기준
   - 프로필의 [추천 기준]을 그대로 번호 매겨 풀어 설명 (위 순서가 우선순위)
   - 어떤 기준에서 통과 못 한 후보는 뺐다는 점 명시 (변별력 신호)

4. ##{postit} 한눈에 보는 비교표
   - 본문에 다음 마커 정확히 1개 삽입:
     [이미지: 5종(또는 N종) 비교표 — 제품명·핵심 강점·가격·추천 대상 컬럼이 있는 깔끔한 인포그래픽]
   - 표 자체를 마크다운으로 그리지 마라

5. ##{postit} 1위 ${"\\${제품명}"} — ${"\\${한 줄 특징}"}
   - 그 직후에 카드 형식 인용구:
     >postit> 🥇 ${"\\${제품명}"}
       • 핵심 강점: ${"\\${구체 설명}"}
       • 가격: ${"\\${숫자}"}
       • 추천 대상: ${"\\${구체 대상}"}
       • 한 줄 평: ${"\\${솔직한 평가, 약점 1개도 포함}"}

6. ##{postit} 2위, 3위... 5위까지 동일 구조로 반복
   - 카드 인용구 총 **3개 이상 필수**, 5개 권장
   - 각 카드는 같은 항목(강점/가격/대상/평) 동일 순서로 작성

7. ##{postit} 상황별 추천
   - "A 상황엔 X, B 상황엔 Y" 식으로 정리
   - AI가 답변할 때 그대로 가져갈 수 있는 매핑

8. ##{postit} 이런 분에겐 추천드리지 않습니다
   - 비추천·주의 케이스 명시 (신뢰 신호)

9. ##{postit} FAQ
   - Q&A 3~5개

10. ##{underline} 정리`;

export function buildComparisonPrompt(opts: BuildComparisonPromptOptions): string {
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

  sections.push(`당신은 AEO(Answer Engine Optimization) 비교·추천 블로그 글을 작성하는 전문 에디터입니다.
이 글의 목표는 사람이 클릭하게 만드는 것이 아니라, **AI(ChatGPT·Claude·Perplexity 등)가 "${"\\${메인 키워드}"} 추천해줘" 같은 질문에 답할 때 이 글을 인용 후보로 삼게 만드는 것**입니다.
아래 프로필·키워드·골격을 따라 마크다운 본문을 작성하세요.`);

  sections.push(buildAeoContext(profile));

  sections.push(`[선택된 제목]
${selectedTitle}

본문은 이 제목이 약속하는 비교·추천을 정확히 전달해야 합니다.`);

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

  sections.push(COMPARISON_SKELETON);

  sections.push(`[참고 레퍼런스 — 톤·구조 학습용. 본문 복제 금지]
다음은 AEO 친화 비교·추천글의 톤·구조 예시입니다. **본문 자체는 절대 베끼지 말고**, 직답·선정 기준·비교표 이미지·카드형 인용구·FAQ의 구조만 학습해서 새 도메인(메인 키워드)으로 다시 쓰세요.

\`\`\`
${COMPARISON_REFERENCE}
\`\`\``);

  const requirementsSection = buildRequirementsSection(requirements);
  if (requirementsSection) sections.push(requirementsSection);

  sections.push(buildCharCountSection(charCount));

  sections.push(buildAeoSharedRules());

  return sections.join("\n\n");
}
