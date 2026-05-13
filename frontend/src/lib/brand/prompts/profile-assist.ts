/**
 * 브랜드 프로필 자동 등록 도우미 프롬프트.
 *
 * 사용자가 자유롭게 입력한 회사/브랜드 자기소개(3~5문장)를 받아
 * BrandProfile JSON으로 자동 변환한다.
 *
 * 비어있거나 모호한 핵심 칸은 `missingFields` 배열에 담아서
 * 클라이언트가 사용자에게 추가 질문을 던질 수 있게 한다.
 *
 * AEO의 profile-assist.ts와 동일한 패턴 (의도적 복제).
 */

/**
 * AI가 비/모호하다고 표시할 수 있는 핵심 필드 이름.
 * BrandProfile의 모든 필드가 아닌, "사용자가 직접 답해야 글 퀄리티가 좌우되는" 핵심 칸만.
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
    "글을 쓰는 분의 권위·경력 근거를 알려주세요. (예: '마케팅 14년, 크루즈 인솔 50회 이상')",
  storyOrigin:
    "왜 이 브랜드를 시작하셨나요? (예: '여행사들의 미끼 가격에 분노해서 직접 공동구매를 시작')",
  differentiators:
    "경쟁사 대비 차별점은 무엇인가요? 한 줄에 하나씩 (예: '전 일정 관광 포함, 추가 비용 0원')",
  targetPrimary:
    "주 고객은 누구인가요? 구체적일수록 좋아요. (예: '첫 크루즈를 꿈꾸는 40~60대 부부')",
  villains:
    "이 시장에서 자주 폭로하고 싶은 '나쁜 관행/경쟁사 유형'이 있나요? 한 줄에 하나씩 (예: '미끼 가격으로 유인하는 여행사', '추가 옵션비 폭탄 업체')",
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
입력에서 명확히 드러나지 않는 핵심 칸은 \`missingFields\` 배열에 그 칸 이름을 넣으세요.
입력에서 드러나는 비핵심 칸들은 합리적으로 추론해서 채우거나 빈 배열/문자열로 두세요.

# 사용자 자기소개
"""
${opts.freeformInput.trim()}
"""

# 출력 필드 정의

## 기본 정보
- label : 브랜드명 그대로 (예: "우리끼리09")
- name : 브랜드/회사 이름
- category : 분야·업종 (예: "크루즈 여행 공동구매 플랫폼")
- oneLine : 한 줄 소개 — 이 브랜드의 정체성을 한 문장으로
- coreValues : 핵심 가치 배열 (예: ["정직 / 투명 가격", "전문가 동행", "공동구매로 거품 제거"])

## 1인칭 화자 (글을 쓰는 사람)
- narrator.name : 화자 이름 (입력에서 추론. 없으면 빈 문자열)
- narrator.role : 화자 직책 (예: "대표", "이사")
- narrator.authority : 화자 권위·경력 근거 (수치·연차·자격) ★중요
- narrator.character : 화자 성격 한 줄 (예: "꼼꼼함, 검색의 달인")
- narrator.fixed : 항상 true

## 주변 인물 (옵션 — 입력에 안 보이면 모두 빈 문자열)
- supportingPersona.name
- supportingPersona.role
- supportingPersona.authority
- supportingPersona.character : 빈 문자열로 둠 (양식에서 제거됨)
- supportingPersona.appearAs : 빈 문자열로 둠 (양식에서 제거됨)

## 스토리 (브랜드 서사의 골격)
- story.origin : 왜 시작했나 ★중요
- story.crisis : 어떤 위기·갈등이 있었나
- story.revival : 어떻게 극복·반전했나
- story.encounter : 핵심적 만남·결합점

## 자산
- episodes : 실제 에피소드 배열 [{ type: "위기 대응" | "감동" | "단골 멘트", content: "..." }]. 입력에 단서 없으면 빈 배열
- authorityAssets : 권위·신뢰 자산 배열 (예: ["크루즈 인솔 50회+", "데이터 분석 14년"])
- targets.primary : 주 고객 한 줄. (secondary/tertiary는 빈 문자열로 두기 — 양식에서 제거됨)
- differentiators : 차별점 배열 ★중요
- villains : 공통의 적 배열 (예: ["미끼형 여행사", "거품형 패키지"]) ★중요
- metaphors : 자주 쓰는 비유 배열 (입력에 단서 없으면 빈 배열)
- signaturePhrases : 시그니처 표현/슬로건 배열 (입력에 단서 없으면 빈 배열)

## 금기 (안전장치)
- forbidden.competitorNames : true (경쟁사 실명 검출 활성, 기본값)
- forbidden.forbiddenWords : 추가 금지 단어 배열 (입력에서 발견되면 추가, 없으면 빈 배열)
- forbidden.adStyle : true (광고 직접 표현 검출 활성, 기본값)

## 양식에서 제거된 필드 (모두 기본값으로 채움)
- services : 빈 배열 []
- recommendedRoutes : 빈 배열 []
- cta.channels : 빈 배열 []

# missingFields 판정 기준
다음 8개 핵심 필드 중 입력에서 **명확히 드러나지 않으면** missingFields에 포함:
- name, category, oneLine
- narratorAuthority (화자 권위 근거)
- storyOrigin (왜 시작했나)
- differentiators (차별점)
- targetPrimary (주 고객)
- villains (공통의 적)

나머지 필드는 missingFields에 넣지 않음 (입력에 없으면 빈 값으로 둠).

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)

{
  "label": "<문자열>",
  "name": "<문자열>",
  "category": "<문자열>",
  "oneLine": "<문자열>",
  "coreValues": [<문자열 배열>],
  "narrator": {
    "name": "<문자열>",
    "role": "<문자열>",
    "authority": "<문자열>",
    "character": "<문자열>",
    "fixed": true
  },
  "supportingPersona": {
    "name": "<문자열, 없으면 빈 문자열>",
    "role": "<문자열, 없으면 빈 문자열>",
    "authority": "<문자열, 없으면 빈 문자열>",
    "character": "",
    "appearAs": ""
  },
  "story": {
    "origin": "<문자열>",
    "crisis": "<문자열>",
    "revival": "<문자열>",
    "encounter": "<문자열>"
  },
  "episodes": [],
  "authorityAssets": [<문자열 배열>],
  "services": [],
  "targets": {
    "primary": "<문자열>",
    "secondary": "",
    "tertiary": ""
  },
  "differentiators": [<문자열 배열>],
  "villains": [<문자열 배열>],
  "metaphors": [],
  "signaturePhrases": [],
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
