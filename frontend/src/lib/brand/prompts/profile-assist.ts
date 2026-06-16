/**
 * 브랜드 프로필 자동 등록 도우미 프롬프트.
 *
 * 사용자가 자유롭게 입력한 회사/브랜드 자기소개(3~5문장)를 받아
 * BrandProfile JSON으로 자동 변환한다.
 *
 * 비어있거나 모호한 핵심 칸은 `missingFields` 배열에 담아서
 * 클라이언트가 사용자에게 추가 질문을 던질 수 있게 한다.
 *
 * v2: 양식 축소에 맞춰 스키마 정리.
 * - 제거 필드: label, supportingPersona, authorityAssets, metaphors, signaturePhrases, narrator.character
 * - authorityAssets 내용은 narrator.authority에 줄바꿈으로 통합 추출
 */

/**
 * AI가 비/모호하다고 표시할 수 있는 핵심 필드 이름.
 */
export type BrandProfileMissingField =
  | "name"
  | "category"
  | "oneLine"
  | "narratorAuthority"
  | "storyOrigin"
  | "differentiators"
  | "targetPrimary"
  | "villains";

/** 클라이언트가 missingField 이름으로 사용자에게 던지는 추가 질문 문구. */
export const BRAND_FOLLOWUP_QUESTIONS: Record<BrandProfileMissingField, string> = {
  name: "브랜드/회사 이름을 알려주세요. (예: '우리끼리09')",
  category: "어떤 분야/업종인가요? (예: '크루즈 여행 공동구매 플랫폼')",
  oneLine:
    "한 줄로 표현하면 어떤 브랜드인가요? (예: '정직한 가격과 전문가 동행으로 첫 크루즈를 책임지는 여행 공구 플랫폼')",
  narratorAuthority:
    "글쓴이의 경력·자격을 알려주세요. 숫자·기간·횟수 위주로 (예: '미르엔 8년 운영, 누적 판매 1만 개, 자체 임상 6개월'). 여러 항목이면 줄바꿈으로 구분.",
  storyOrigin:
    "왜 이 브랜드를 시작하셨나요? (예: '여행사들의 미끼 가격에 분노해서 직접 공동구매를 시작')",
  differentiators:
    "경쟁사 대비 차별점은 무엇인가요? 한 줄에 하나씩 (예: '전 일정 관광 포함, 추가 비용 0원')",
  targetPrimary:
    "주 고객은 누구인가요? 구체적일수록 좋아요. (예: '첫 크루즈를 꿈꾸는 40~60대 부부')",
  villains:
    "이 시장에서 자주 폭로하고 싶은 업계의 잘못된 관행이 있나요? 한 줄에 하나씩 3~5개 권장 (예: '미끼 가격으로 유인하는 여행사', '추가 옵션비 폭탄 업체')",
};

export interface BuildBrandProfileAssistPromptOptions {
  /** 사용자가 자유롭게 입력한 브랜드/회사 자기소개 */
  freeformInput: string;
}

export function buildBrandProfileAssistPrompt(
  opts: BuildBrandProfileAssistPromptOptions
): string {
  return `당신은 브랜드 블로그 작성용 프로필을 정리해주는 친절한 도우미입니다.

# 임무
아래 사용자가 자유롭게 쓴 브랜드/회사 자기소개를 받아, 브랜드 프로필 JSON으로 변환하세요.

**적극 채우기 원칙:**
- 입력에 단어가 그대로 있지 않아도, **입력의 단서로 합리적 추론이 가능하면 채워주세요**.
- 예: 입력에 "민감 피부 화장품"이 있으면:
  · category → "민감 피부 화장품" (그대로 채움)
  · targets.primary → "민감성 피부로 제품 선택에 어려움 겪는 분들" (합리적 추론)
  · differentiators → 입력의 강점·차별점을 재구성 (예: "자체 임상 6개월" → "임상 검증된 안전성")
  · villains → 같은 도메인의 흔한 문제점 (예: 화장품 → "성분 표기 속임", "과장 광고")
- 도메인 일반 지식을 적극 활용하되, **사용자 입력에 근거를 둔** 추론만 하세요. 완전히 새로운 사실을 만들어내지 마세요.

**story 4단 + coreValues 적극 추론 (특히 중요)**
사용자가 story.origin(시작 계기) 만 답한 경우에도, 도메인 일반 패턴과 입력 단서로 다음을 합리적으로 추론하세요:
- story.crisis (사업하면서 겪은 어려움): 도메인의 일반적 초기 난관 + 입력의 약점·고민 단서 결합
  · 예시: 화장품 브랜드 → "초기엔 시중에 비슷한 제품이 많아 차별화하기 어려웠음" 같은 일반 패턴
- story.revival (어떻게 극복했나): 입력의 강점·실적을 극복 과정으로 재구성
  · 예시: "자체 임상 6개월"이 입력에 있으면 → "수많은 시행착오 끝에 자체 임상 6개월을 거친 처방을 만들어 안정화"
- story.encounter (결정적 만남·깨달음): story.origin의 동기를 한 번 더 응축한 깨달음 문장
  · 예시: "민감 피부 직접 경험" → "결국 내가 겪은 문제를 가장 잘 푸는 사람도 나라는 깨달음"
- coreValues (핵심 가치): 입력 전체 톤·차별점·강점에서 우러나는 핵심 가치 2~4개 추론
  · 예시: "자체 임상 6개월, 안전 성분" → ["검증된 안전성", "임상 기반 신뢰", "민감 피부 우선"]

이 4개 필드는 **사용자가 단서를 다 주지 않아도 도메인 추론으로 채워두는 게 사용자에게 도움**. 빈 칸으로 두면 사용자가 양식 모달에서 또 채워야 하므로 부담.

**missingFields는 정말 단서가 0개인 칸만** 넣으세요. 추론 가능한 칸은 채워두는 게 사용자에게 더 좋습니다.

# 사용자 자기소개
"""
${opts.freeformInput.trim()}
"""

# 출력 필드 정의

## 기본 정보
- name : 브랜드/회사 이름
- category : 분야·업종 (예: "크루즈 여행 공동구매 플랫폼")
- oneLine : 한 줄 소개 — 이 브랜드의 정체성을 한 문장으로
- coreValues : 핵심 가치 배열 — 선택 입력 (입력에서 단서 없으면 빈 배열)

## 1인칭 화자 (글을 쓰는 사람 = 글쓴이)
- narrator.name : 글쓴이 이름
- narrator.role : 글쓴이 직책 (예: "대표", "이사")
- narrator.authority : ★중요. 글쓴이 경력·자격. **여러 항목을 줄바꿈("\\n")으로 구분한 단일 문자열**.
  - 숫자·기간·횟수 위주로. 예시: "미르엔 8년 운영\\n누적 판매 1만 개\\n자체 임상 6개월\\n재구매율 35%"
  - 입력에 권위 단서가 여러 개 있으면 모두 줄바꿈으로 모아 한 문자열로
- narrator.fixed : 항상 true

## 스토리 (브랜드 서사의 골격)
- story.origin : 왜 시작했나 ★중요
- story.crisis : 어떤 어려움이 있었나
- story.revival : 어떻게 극복·반전했나
- story.encounter : 핵심적 만남·결합점

## 자산
- episodes : 실제 에피소드 배열 [{ type: "위기 대응" | "감동" | "단골 멘트", content: "..." }]. 입력에 단서 없으면 빈 배열
- targets.primary : 주 고객 한 줄. (secondary/tertiary는 빈 문자열로 두기)
- differentiators : 차별점 배열 ★중요
- villains : 공통의 적 배열 (예: ["미끼형 여행사", "거품형 패키지"]) ★중요. 3~5개 권장.
- customerCases : 실제 고객 후기·사례 배열 (가치입증글의 제3자 증명 재료).
  ★ 입력에 **실제 고객 반응 단서**가 있으면 '고객 반응' 문장으로 재구성해 1~3개 채운다:
    · 재구매율·재구매 언급 → 예: "꾸준히 재구매로 이어지는 단골 고객이 많음"
    · 입소문·"먼저 알아챔"·"다시 사러 옴" → 예: "광고 없이 입소문으로 다시 찾아주시는 고객"
    · 고객 피드백·후기 언급(story.encounter 등) → 그 취지를 일반적 고객 반응 문장으로
  ★ **절대 금지**: 존재하지 않는 구체적 후기·가짜 고객 이름·지어낸 수치·만들어낸 일화. 입력 단서를 일반화만 하라(없는 사실 창작 금지 — 가짜 후기는 브랜드 신뢰를 해친다).
  ★ 입력에 고객 반응 단서가 전혀 없으면 **빈 배열**.

## 금기 (안전장치)
- forbidden.competitorNames : true (경쟁사 실명 검출 활성, 기본값)
- forbidden.adStyle : true (광고 직접 표현 검출 활성, 기본값)
- forbidden.forbiddenWords : 추가 금지 단어 배열. **입력에서 안 보이면 도메인 기반으로 합리적 기본값을 추천**:
  · 화장품·뷰티 → ["완치", "치료", "특허", "독점"]
  · 의료·헬스 → ["처방", "치료", "완치", "특허", "독점"]
  · 여행 → ["최저가 보장", "단독", "유일", "100% 환불"]
  · 식품 → ["완치", "효과 보장", "FDA 승인" (한국 도메인일 때)]
  · 그 외 → ["최고", "최저", "1위" 등 단정적 표현]
  · 입력에서 도메인이 모호하면 빈 배열로 둠.

## 양식에서 제거된 필드 (모두 기본값으로 채움)
- services : 빈 배열 []
- recommendedRoutes : 빈 배열 []
- cta.channels : 빈 배열 []

# missingFields 판정 기준 (객관적 임계값)

다음 8개 필드에 대해 **입력에서 단서가 0개**인 경우에만 missingFields에 포함하세요.
단서가 1개라도 있으면(직접 명시 또는 합리적 추론 가능) 채우고 missingFields에서 제외.

- name: 회사/브랜드 이름 단서 0개 → missing
- category: 분야 단서 0개 → missing
- oneLine: 브랜드 정체성 단서 0개 → missing
- narratorAuthority: 경력·연차·실적 수치 단서 0개 → missing
- storyOrigin: 시작 동기·계기 단서 0개 → missing
- differentiators: 강점·차별점 단서 0개 → missing
- targetPrimary: 고객·타겟 단서 0개 → missing
- villains: 업계 불만·폭로 대상 단서 0개 → missing (단, 도메인이 명확하면 일반적 업계 관행으로 추론 가능)

**중요**: 위 기준은 "사용자가 직접 적은 단어"만 보지 말고, "추론 가능 여부"로 판단. 추론 가능하면 채워라.

나머지 필드는 missingFields에 절대 넣지 않음 (입력에 없으면 빈 값으로 둠).

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)

{
  "name": "<문자열>",
  "category": "<문자열>",
  "oneLine": "<문자열>",
  "coreValues": [<문자열 배열>],
  "narrator": {
    "name": "<문자열>",
    "role": "<문자열>",
    "authority": "<여러 항목이면 \\\\n으로 구분한 단일 문자열>",
    "fixed": true
  },
  "story": {
    "origin": "<문자열>",
    "crisis": "<문자열>",
    "revival": "<문자열>",
    "encounter": "<문자열>"
  },
  "episodes": [],
  "services": [],
  "targets": {
    "primary": "<문자열>",
    "secondary": "",
    "tertiary": ""
  },
  "differentiators": [<문자열 배열>],
  "villains": [<문자열 배열>],
  "customerCases": [<문자열 배열>],
  "recommendedRoutes": [],
  "cta": { "channels": [] },
  "forbidden": {
    "competitorNames": true,
    "forbiddenWords": [],
    "adStyle": true
  },
  "missingFields": [<위 8개 중 빈/모호한 필드 이름 배열>]
}`;
}
