/**
 * AEO 검문소 (template-fit) 프롬프트.
 *
 * 글 생성 직전, 사용자가 고른 AEO 글 타입(informational/comparison) ↔
 * 입력한 주제·키워드가 의미적으로 어울리는지 LLM에게 판정시킨다.
 *
 * 브랜드 검문소(lib/brand/prompts/template-fit.ts)의 패턴을 미러.
 */
import type { AeoTemplateId } from "@/types/aeo";

export interface AeoTemplateFitInput {
  template: AeoTemplateId;
  topic?: string | null;
  mainKeyword: string;
  subKeywords?: string;
  selectedTitle?: string;
}

/**
 * 글 타입별 의도 정의.
 * 사용자가 고른 타입에 적합한 주제인지 판정할 때 기준으로 사용.
 */
const TEMPLATE_INTENTS: Record<AeoTemplateId, string> = {
  informational: `
[정보성글]
- 의도: "왜·어떻게·무엇" 같은 자연어 질문에 답해주는 가이드 글. AI가 사용자에게 답할 때 배경·원리·해결법을 인용하기 좋은 형식.
- 맞는 주제 예시:
  · "임산부 탈모의 원인과 시기별 관리법"
  · "산후 회복 영양제, 무엇을 먼저 봐야 하나"
  · "수유 중 카페인 어디까지 안전한가"
- 안 맞는 주제 예시:
  · "임산부 탈모샴푸 TOP 5 비교" (이건 비교·추천글)
  · "내가 써본 ○○샴푸 후기" (개인 후기형)
- 판정 핵심: 주제가 "왜/어떻게/무엇" 류 정보 전달인가? 여러 옵션 추천이 핵심이면 X.
`.trim(),

  comparison: `
[비교·추천글]
- 의도: 여러 옵션을 기준대로 비교하고 상황별로 추천하는 글. AI가 "○○ 추천해줘" 류 질문에 답할 때 가장 자주 인용하는 형식.
- 맞는 주제 예시:
  · "임산부 안전 탈모샴푸 TOP 5 비교"
  · "산후 영양제 5종 안전성 비교"
  · "수유 중 안전한 진통제, 어떤 게 좋을까"
- 안 맞는 주제 예시:
  · "임산부 탈모의 원인 5가지" (이건 정보성글)
  · "내가 임신 중 겪은 일들" (개인 에세이)
- 판정 핵심: 주제가 "여러 옵션 중 추천·선택"을 다루는가? 단순 정보 전달이면 X.
`.trim(),
};

/**
 * 검증 대상 여부 판단. 미정의 템플릿은 스킵.
 */
export function shouldRunAeoFitCheck(input: AeoTemplateFitInput): boolean {
  return input.template in TEMPLATE_INTENTS;
}

export function buildAeoTemplateFitPrompt(input: AeoTemplateFitInput): string {
  const intent = TEMPLATE_INTENTS[input.template];
  if (!intent) {
    throw new Error(`AEO 템플릿 의도 미정의: ${input.template}`);
  }

  const topicLine = input.topic?.trim() || "(주제 미입력)";
  const mainLine = input.mainKeyword?.trim() || "(메인 키워드 미입력)";
  const subLine = input.subKeywords?.trim() || "(없음)";

  return `
당신은 AEO(Answer Engine Optimization) 블로그의 글 타입을 정확히 판정하는 시니어 에디터입니다.

# 임무
사용자가 고른 AEO 글 타입과, 사용자가 입력한 **주제(topic)** 가 의미적으로 어울리는지 판정하세요.
**주제(topic)** 가 진실 신호입니다. 메인 키워드는 보조 신호일 뿐.

# 핵심 판정 원칙
1. **주제 자체의 톤**으로만 판단하세요. 단어가 비슷하다고 안일하게 통과시키지 마세요.
2. 정보성글과 비교추천글의 차이:
   - 정보성글: "왜/어떻게/무엇" 류 — 원리·원인·가이드
   - 비교추천글: "어떤 ○○이 좋을까/추천" 류 — 여러 옵션 중 선택
3. 애매하면 통과(match=true)보다 **거절(match=false, confidence 0.6~0.8)** 로 보내 사용자에게 한 번 더 점검 기회를 주세요.

# 글 타입 정의
${intent}

# 사용자 입력
- 주제(topic, 가장 중요): ${topicLine}
- 메인 키워드: ${mainLine}
- 서브 키워드: ${subLine}

# 추천 주제 작성 규칙 (안 맞을 때만)
서로 다른 각도로 3개 제안:
- 각각 다른 프레임 (원인 분석 / 시기별 가이드 / FAQ형 등 정보성 / 비교 추천 / 상황별 추천)
- 메인 키워드는 가능한 살릴 것
- 길이는 각각 35자 내외

# Few-shot 예시

예시 1)
글 타입: 비교·추천글
주제: "임산부 탈모의 원인 5가지"
판정: { "match": false, "confidence": 0.9, "reason": "주제가 '원인 분석'은 정보성글에 맞는 톤이에요. 비교·추천글은 여러 옵션을 비교하는 글 형식입니다.", "suggestions": ["임산부 안전 탈모샴푸 TOP 5 비교", "성분으로 따져본 임산부 탈모샴푸 추천", "임신 시기별 탈모샴푸 추천 매트릭스"] }

예시 2)
글 타입: 정보성글
주제: "임산부 탈모샴푸 TOP 5"
판정: { "match": false, "confidence": 0.88, "reason": "'TOP 5 비교'는 비교·추천글에 맞는 톤이에요. 정보성글은 원리·원인·가이드 형식입니다.", "suggestions": ["임산부 탈모의 5가지 원인과 호르몬 작용", "산후 탈모 시기별 두피 관리 가이드", "임산부 안전 성분 — 무엇을 보고 골라야 하나"] }

예시 3)
글 타입: 정보성글
주제: "임산부 탈모의 원인과 관리법"
판정: { "match": true, "confidence": 0.95, "reason": "원인 분석 + 관리법 = 정보성글의 전형적 구조입니다.", "suggestions": [] }

예시 4)
글 타입: 비교·추천글
주제: "임산부 안전 탈모샴푸 TOP 5"
판정: { "match": true, "confidence": 0.95, "reason": "여러 옵션을 비교·추천하는 비교추천글의 전형입니다.", "suggestions": [] }

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)
{
  "match": <boolean — 의미상 잘 어울리면 true, 애매·불일치면 false>,
  "confidence": <0.0 ~ 1.0 숫자 — 판정 신뢰도>,
  "reason": "<한국어 1~2문장 — 사용자에게 보여줄 친절한 판정 이유>",
  "suggestions": <한국어 문자열 배열 — 안 맞을 때만 서로 다른 각도의 대체 주제 3개. 맞을 때는 빈 배열 []>
}
`.trim();
}
