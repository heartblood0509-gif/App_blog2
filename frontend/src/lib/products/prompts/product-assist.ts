/**
 * 후기성 블로그 — 제품 자동 등록 도우미 프롬프트.
 *
 * 사용자가 자유롭게 입력한 제품 한 줄~여러 줄 설명을 받아
 * UserProduct 등록 폼의 모든 칸을 자동으로 채워준다.
 *
 * 브랜드 어시스턴트(`lib/brand/prompts/profile-assist.ts`)의 패턴을 복제.
 *
 * v2 (사이클 2 — 환각 가드 강화):
 * - 성분명·구체 수치·임상 결과는 사용자 입력에 명시되지 않으면 절대 만들지 말 것
 * - aiGuessFields 배열로 "AI가 추론으로 채운 필드"를 명시 → UI에서 노란 배경 + 배지 표시
 * - 후기성 글 빌딩 블록 5개 추가 필드 처리
 */

/** AI가 비/모호하다고 표시할 수 있는 핵심 필드. */
export type ProductMissingField =
  | "name"
  | "category"
  | "efficacy"
  | "differentiator"
  | "relatedSymptoms"
  | "keyInsight";

/** 클라이언트가 missingField 이름으로 사용자에게 던지는 추가 질문 문구. */
export const PRODUCT_FOLLOWUP_QUESTIONS: Record<ProductMissingField, string> = {
  name: "제품 이름을 알려주세요. (예: '미르엔 탈모샴푸')",
  category: "어떤 카테고리 제품인가요? (예: '헤어케어', '바디케어')",
  efficacy:
    "이 제품을 쓰면 뭐가 좋아지나요? 효능·기대 효과 위주로 (예: '두피 진정, 빠짐 환경 개선')",
  differentiator:
    "다른 제품과 비교했을 때 차별점은 무엇인가요? (예: '잡는 게 아니라 환경 개선 방향')",
  relatedSymptoms:
    "이 제품이 해결해주는 고민·증상은 무엇인가요? 한 줄에 하나씩 (예: '탈모, 두피 가려움')",
  keyInsight:
    "이 제품을 한 문장으로 표현하면? (예: '탈모를 잡는다보다 빠질 환경을 줄이는 타입')",
};

export interface BuildProductAssistPromptOptions {
  /** 사용자가 자유롭게 입력한 제품 소개 */
  freeformInput: string;
  /** 신상품 여부 — true면 expectedReactions만 채우고 realReviews 비움 */
  hasReviews: boolean;
}

export function buildProductAssistPrompt(
  opts: BuildProductAssistPromptOptions
): string {
  const reviewModeHint = opts.hasReviews
    ? `사용자가 "이미 출시되어 후기가 있는 제품"으로 표시했습니다.
- realReviews: 입력에 실제 후기 인용이 있으면 자연스러운 1인칭 후기 톤으로 3~5개 추출. 없으면 도메인 일반 후기 패턴으로 합리적 추정 (단, 단정적 효능 주장은 금지).
- expectedReactions: 빈 배열 []`
    : `사용자가 "신규 출시 / 후기가 아직 없는 제품"으로 표시했습니다.
- realReviews: 빈 배열 []
- expectedReactions: 입력의 효능·차별점·사용감 단서로 "사용자가 이렇게 반응할 것 같다" 3~5개 추론. 단정적이지 않게 ("~한 느낌일 듯", "꾸준히 쓰면 차이가 보일 타입").`;

  return `당신은 후기성 블로그 작성용 제품 정보를 정리해주는 친절한 도우미입니다.

# 임무
아래 사용자가 자유롭게 쓴 제품 소개를 받아, 후기성 블로그 제품 폼의 칸을 자동으로 채워주세요.

# ⛔ 절대 환각 금지 영역 (가장 중요)

다음 항목은 사용자 입력에 **명시적으로 등장**해야만 채울 수 있습니다. 도메인 추론 금지:

1. **ingredients (핵심 성분)** — "비오틴", "살리실산", "케라틴" 같은 구체적 성분명. 입력에 없으면 빈 문자열 "" 그대로.
2. **숫자·수치** — 함량(%, mg), 임상 기간, 사용자 수, 효과 통계 등. 절대 추정 금지.
3. **임상 결과·인증** — "FDA 승인", "자체 임상 6개월", "특허 출원" 등. 입력에 없으면 절대 만들지 말 것.
4. **브랜드명·회사명** — 입력에 정확한 이름이 없으면 추측 금지.

위 4개 영역은 거짓 정보가 들어가면 글에 그대로 박혀서 사용자(블로그 운영자)에게 신뢰도·법적 리스크가 생깁니다. **반드시 빈 칸으로 두고 missingFields에 포함**하세요.

# ✅ 추론해도 좋은 영역 (도메인 패턴 활용)

다음은 입력 단서로 도메인 패턴 추론이 안전한 영역:

- efficacy (효능·기대 효과) — 카테고리 일반 효과 ("두피 진정", "보습"). 단, 단정 표현 ("100% 효과") 금지.
- usability (사용감) — 카테고리 일반 감각 ("개운한 마무리감").
- differentiator (차별 포인트) — 입력의 강점·접근법 재구성.
- usage (사용 방법·팁) — 카테고리 일반 사용법.
- keyInsight — 제품 정체성 한 줄.
- relatedSymptoms / naturalMentionPatterns / sensoryDetails — 카테고리 일반 패턴.
- expectedReactions / realReviews — 위 후기 모드 규칙 따름.

# 안 맞을 수 있는 케이스 (사이클 3 — 신뢰도 단락의 핵심)

\`precautions\` (부작용·안 맞을 수 있는 케이스)는 **입력에 단서가 있을 때만** 채우세요. 단서가 없으면 빈 문자열 "" — 사용자만 알 수 있는 영역이므로 추론 금지. (시간축·전환 서사·페르소나·가격은 글쓰기 AI가 서사 템플릿으로 자동 생성하므로 별도 필드 없음.)

# aiGuessFields 배열 (사용자 검토용)

응답 JSON에 \`aiGuessFields\` 배열을 포함하세요. **사용자 입력에 직접 단서가 없는데 AI가 도메인 추론으로 채운 필드**의 이름을 모두 나열. UI에서 노란 배경 + "AI 추정" 배지로 표시되어 사용자가 검토합니다.

예시:
- 입력: "미르엔 탈모샴푸, 비오틴 함유"
- aiGuessFields: ["efficacy", "usability", "differentiator", "usage", "relatedSymptoms", "naturalMentionPatterns", "sensoryDetails", "keyInsight"]
  (name=미르엔, category=헤어케어, ingredients=비오틴 은 입력 명시 → 추정 아님)

# 후기 모드 분기
${reviewModeHint}

**missingFields는 정말 단서가 0개인 칸만** 넣으세요. 단, **ingredients는 단서 0개면 항상 missingFields에 포함** (환각 금지).

# ⛔ 전체 출력 공통 가드
- **모든 배열 필드 (relatedSymptoms, naturalMentionPatterns, sensoryDetails, realReviews, expectedReactions)**: 해시태그(#) 시작 단어 절대 금지. 이건 SEO 태그가 아닌 본문 톤 가이드용 자연어.
- 단정적 효능 주장 ("100% 효과", "완치", "FDA 승인" 등) 금지.

# 사용자 제품 설명
"""
${opts.freeformInput.trim()}
"""

# 출력 필드 정의

## 기본 정보
- name : 제품 이름
- category : 카테고리 (예: "헤어케어", "바디케어", "헤어케어 도구")
- keyInsight : 제품의 핵심 방향성 한 문장

## 장점 5분할 (각 필드는 줄바꿈으로 여러 항목 가능, 라벨·헤더 포함 금지)
- efficacy : 효능·기대 효과 (자연스러운 한국어 문장)
- ingredients : 핵심 성분·특징 (⛔ 환각 금지 — 입력에 명시 없으면 "")
- usability : 사용감 (감각)
- differentiator : 차별 포인트
- usage : 사용 방법·팁

## 후기 관련
- realReviews : 실제 후기 배열 (따옴표 없는 자연스러운 1인칭 문장)
- expectedReactions : 예상 사용자 반응 배열

## 톤·맥락 (⚠️ 시드 6개 제품과 동일 톤으로 — 가장 자주 망가지는 영역)

- **relatedSymptoms** : 이 제품이 해결해주는 고민·증상 배열 (4~6개)
  · 형식: 짧은 키워드 또는 문구
  · ✅ 좋은 예시: ["탈모", "머리카락 빠짐", "두피 가려움", "두피 각질", "두피 냄새"]
  · ⛔ 금지: 해시태그(#) 사용 금지

- **naturalMentionPatterns** : 블로그 본문에서 이 제품을 처음 운 띄울 때 자연스러운 **1인칭 일상 표현** (3~5개)
  · ⚠️ 이 필드는 SEO 해시태그가 아닙니다. **본문 도입부에 들어갈 자연스러운 문장 조각**입니다.
  · 형식: 한국 일상 후기 블로그 톤. "~한 ○○", "~ 써본", "~ 바꿔본" 같은 1인칭 일상 표현
  · ✅ 좋은 예시: ["요즘 쓰고 있는 샴푸", "지인 추천으로 써보기 시작한", "우연히 바꿔보게 된", "맘카페에서 후기 보고 바꿔본"]
  · ⛔ **절대 금지**: 해시태그 형태("#두피케어", "#탈모고민" 같은) — 이건 SEO 태그지 본문 도입부 표현이 아님
  · ⛔ 금지: 과장 광고 표현 ("최고의", "필수템", "1위" 등)

- **sensoryDetails** : 사용 시 감각·느낌을 짧게 묘사한 표현 배열 (3~5개)
  · 형식: 짧은 형용사구 또는 1인칭 문장 조각
  · ✅ 좋은 예시: ["당김 없이 촉촉함 유지", "간지러움이 확실히 덜한 느낌", "두피가 편안한 상태가 오래 유지", "린스 없어도 될 정도로 부드러운 마무리감"]
  · ⛔ 금지: 해시태그, 단정적 효능 주장

## 안 맞을 수 있는 케이스 (사이클 3 — 입력 단서 있을 때만)
- precautions : 부작용·안 맞을 수 있는 케이스

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)

{
  "name": "<문자열>",
  "category": "<문자열>",
  "keyInsight": "<문자열>",
  "efficacy": "<여러 줄이면 \\\\n으로 구분한 단일 문자열>",
  "ingredients": "<문자열 — ⛔ 환각 금지>",
  "usability": "<문자열>",
  "differentiator": "<문자열>",
  "usage": "<문자열>",
  "realReviews": [<문자열 배열>],
  "expectedReactions": [<문자열 배열>],
  "relatedSymptoms": [<문자열 배열>],
  "naturalMentionPatterns": [<문자열 배열>],
  "sensoryDetails": [<문자열 배열>],
  "precautions": "<문자열 — 입력 단서 있을 때만>",
  "missingFields": [<위 6개 중 빈/모호한 필드 이름 배열>],
  "aiGuessFields": [<입력에 명시되지 않은 필드 이름 배열 — 도메인 추론으로 채운 것>]
}`;
}
