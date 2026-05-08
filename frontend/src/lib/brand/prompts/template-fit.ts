/**
 * 검문소 (template-fit) 프롬프트.
 *
 * 글 생성 직전, 사용자가 고른 템플릿 ↔ 입력한 주제/키워드 조합이
 * 의미적으로 어울리는지 LLM에게 판정시킨다.
 *
 * - 본문 생성 프롬프트와 분리. 본문 퀄리티에 영향 0.
 * - 출력은 JSON 강제. 신뢰도 0~1.
 * - info-custom 은 사용자 레퍼런스 기반이므로 검증 스킵 (호출부에서 처리).
 */
import type { BrandTemplateId, BrandInfoVariantId } from "@/types/brand";

export interface TemplateFitInput {
  template: BrandTemplateId;
  infoVariantId?: BrandInfoVariantId | null;
  topic?: string | null;
  mainKeyword: string;
  subKeywords?: string;
  /** 호환성을 위해 남겨두지만 프롬프트엔 사용 안 함. 제목은 AI가 템플릿에 끼워맞춘 다운스트림 산출물이라 판정 노이즈가 됨. */
  selectedTitle?: string;
}

/**
 * 템플릿별 "맞는 글" 정의. LLM에게 의도를 명시적으로 박아주는 게 정확도 핵심.
 * 새 템플릿 추가 시 여기 함께 추가.
 */
const TEMPLATE_INTENTS: Record<string, string> = {
  intro: `
[소개글]
- 의도: 브랜드/회사/사람을 처음 소개하면서 신뢰를 쌓는 글
- 맞는 주제: 브랜드 스토리, 창업 배경, 사람 소개, 가치관, "왜 이 일을 하는가"
- 안 맞는 주제: 단순 정보 안내, 경쟁사 폭로, 후기, 상품 비교
`.trim(),

  "info-5": `
[정보성글 - 함정 폭로형]
- 의도: 업계의 함정/사기/비양심을 폭로하고, N가지 주의사항으로 솔루션을 제시하는 글
- 핵심: 반드시 "타사·업계의 문제점을 드러낸다 → 그래서 우리 브랜드가 다르다"는 구도가 성립해야 함
- 맞는 주제 예시:
  · "여행사들이 안 알려주는 크루즈 추가요금 5가지"
  · "헤어케어 매장이 절대 말 안 하는 함정"
  · "○○ 살 때 사기당하는 패턴"
- 안 맞는 주제 예시:
  · "크루즈 탈 때 주의사항" (단순 안내 → 폭로 구도 없음)
  · "여행 짐 싸는 법" (정보 전달일 뿐)
  · "함정 카드 활용법" (단어가 같아도 게임/취미 글)
- 판정 핵심: 주제가 "경쟁사·업계가 숨기는 무언가를 드러내는" 성격인가?
`.trim(),
};

/**
 * 호출 가능한 템플릿인지 (검증 대상인지) 판단.
 * - info-custom: 사용자 레퍼런스 기반이라 스킵
 * - 미정의 템플릿: 스킵 (안전 폴백)
 */
export function shouldRunFitCheck(input: TemplateFitInput): boolean {
  if (input.template === "info" && input.infoVariantId === "info-custom") {
    return false;
  }
  // info 템플릿일 때는 변형 ID로 키 결정
  const key = input.template === "info" ? input.infoVariantId : input.template;
  if (!key) return false;
  return key in TEMPLATE_INTENTS;
}

function getIntentKey(input: TemplateFitInput): string | null {
  if (input.template === "info") return input.infoVariantId ?? null;
  return input.template;
}

export function buildTemplateFitPrompt(input: TemplateFitInput): string {
  const key = getIntentKey(input);
  const intent = key ? TEMPLATE_INTENTS[key] : null;
  if (!intent) {
    throw new Error(`템플릿 의도 미정의: ${key}`);
  }

  const topicLine = input.topic?.trim() || "(주제 미입력)";
  const mainLine = input.mainKeyword?.trim() || "(메인 키워드 미입력)";
  const subLine = input.subKeywords?.trim() || "(없음)";

  return `
당신은 한국어 블로그 콘텐츠의 톤·구조를 정확히 판정하는 시니어 카피라이터입니다.

# 임무
사용자가 고른 글 템플릿과, 사용자가 직접 입력한 **주제(topic)** 가 의미적으로 어울리는지 판정하세요.
**주제(topic)** 가 진실 신호입니다. 메인 키워드는 보조 신호일 뿐이며, 둘 사이가 충돌하면 주제를 우선시하세요.

# 핵심 판정 원칙 (매우 중요)
1. **주제 자체의 톤**으로만 판단하세요. 단어가 일부 비슷하다고 안일하게 통과시키지 마세요.
2. **단순 안내·주의사항·꿀팁·정보 전달·후기·소개·체험기 톤의 주제**는 폭로형과 절대 맞지 않습니다 → match=false.
3. 폭로형으로 통과(match=true)하려면 주제에 "폭로 의도"가 명확해야 합니다. 다음 중 하나는 있어야:
   - 경쟁사·타사·업계가 "숨기는/안 알려주는/속이는/사기치는/뒷통수치는" 무엇
   - "함정/덫/지뢰/속임수/꼼수" 같은 폭로 키워드 + 그 주체가 업계/경쟁사
   - "○○가 절대 말 안 하는" 식의 폭로 프레임
4. 애매하면 통과(match=true)가 아니라 **거절(match=false, confidence 0.6~0.8)** 로 보내서 사용자가 한 번 더 점검할 기회를 주세요.

# 템플릿 정의
${intent}

# 사용자 입력
- 주제(topic, 가장 중요): ${topicLine}
- 메인 키워드: ${mainLine}
- 서브 키워드: ${subLine}

# 추천 주제 작성 규칙 (안 맞을 때만)
사용자가 다양한 선택지를 보고 마음에 드는 걸 고를 수 있도록, **서로 각도가 다른 3개**를 제안하세요.
- 각각 다른 "프레임"으로 작성: 비용/요금 폭로 / 서비스·품질 폭로 / 사기·속임수 폭로 / 비교 폭로 / 초보자 함정 등
- 메인 키워드는 가능한 살려서 사용
- 세 개가 서로 비슷하면 안 됩니다 (각도 다양성이 핵심)
- 길이는 각각 35자 내외

# Few-shot 예시

예시 1)
템플릿: 함정 폭로형
주제: "MCS 크루즈 탈 때 주의사항"
판정: { "match": false, "confidence": 0.92, "reason": "주제가 '주의사항' = 일반 안내·정보 전달 톤입니다. 함정 폭로형은 경쟁사·업계가 숨기는 무엇을 드러내야 하는데, 이 주제엔 폭로 대상·폭로 의도가 없습니다.", "suggestions": ["여행사들이 안 알려주는 MCS 크루즈 추가요금 함정 5가지", "MCS 크루즈 패키지 광고가 숨기는 서비스 품질의 진실", "초보자가 첫 MCS 크루즈에서 당하는 사기 패턴 5가지"] }

예시 2)
템플릿: 함정 폭로형
주제: "크루즈 처음 타는 사람을 위한 꿀팁"
판정: { "match": false, "confidence": 0.9, "reason": "'꿀팁'은 정보 전달 톤이라 폭로형과 맞지 않습니다.", "suggestions": ["여행사들이 초보자에게 절대 안 알려주는 크루즈 함정", "첫 크루즈 손님이 가장 많이 속는 5가지 패턴", "크루즈 비교사이트가 숨기는 초보자 함정"] }

예시 3)
템플릿: 함정 폭로형
주제: "여행사들이 숨기는 크루즈 추가요금 5가지"
판정: { "match": true, "confidence": 0.92, "reason": "업계가 숨기는 비용을 폭로하는 구도가 명확합니다.", "suggestions": [] }

예시 4)
템플릿: 함정 폭로형
주제: "함정 카드 활용법"
판정: { "match": false, "confidence": 0.95, "reason": "'함정' 단어가 들어갔지만 카드 게임 용어로 보이며 업계 폭로와 무관합니다.", "suggestions": [] }

예시 5)
템플릿: 함정 폭로형
주제: "MCS 크루즈 후기"
판정: { "match": false, "confidence": 0.9, "reason": "후기는 체험·평가 글이라 폭로 구도가 성립하지 않습니다.", "suggestions": ["MCS 크루즈 타고 알게 된 다른 여행사들의 진실", "후기에 안 적힌 MCS 크루즈 추가요금 폭로", "체험기로 쓴 MCS 크루즈 vs 경쟁사 함정 비교"] }

예시 6)
템플릿: 소개글
주제: "우리 브랜드가 시작된 이야기"
판정: { "match": true, "confidence": 0.95, "reason": "브랜드 스토리는 소개글의 핵심 주제입니다.", "suggestions": [] }

예시 7)
템플릿: 소개글
주제: "헤어 토닉 사용 후기"
판정: { "match": false, "confidence": 0.85, "reason": "소개글은 브랜드/사람 소개 글이므로 후기성 주제와 맞지 않습니다.", "suggestions": ["헤어 토닉을 만든 우리 브랜드 이야기", "헤어 토닉 개발자가 직접 들려주는 창업 스토리", "왜 우리는 헤어 토닉에 집착했나 — 브랜드 소개"] }

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)
{
  "match": <boolean — 의미상 잘 어울리면 true, 애매·불일치면 false>,
  "confidence": <0.0 ~ 1.0 숫자 — 판정 신뢰도>,
  "reason": "<한국어 1~2문장 — 판정 이유. 사용자에게 보여줄 메시지이므로 친절하게>",
  "suggestions": <한국어 문자열 배열 — 안 맞을 때만 서로 다른 각도의 대체 주제 3개. 맞을 때는 빈 배열 []>
}
`.trim();
}
