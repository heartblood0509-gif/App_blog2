/**
 * AEO 프로필 자동 등록 도우미 프롬프트.
 *
 * 사용자가 자유롭게 입력한 자기소개(3~5문장)를 받아
 * AEO 프로필 8칸 JSON으로 자동 변환한다.
 *
 * v2 갱신:
 * - 예시를 약사맘 → 미르엔(성분 전문가, 바디·헤어케어)으로 교체
 * - "명확히" 완화: 입력 단서로 합리적 추론 가능하면 채워라
 */

/**
 * AI가 비/모호하다고 표시할 수 있는 필드 이름.
 * 클라이언트는 이 이름으로 사용자에게 추가 질문을 던진다.
 */
export type AeoProfileMissingField =
  | "name"
  | "category"
  | "oneLineIntro"
  | "experience"
  | "credentials"
  | "audience"
  | "recommendationCriteria"
  | "trustedSources"
  | "forbidden";

/** 클라이언트가 missingField 이름으로 사용자에게 던지는 추가 질문 문구. */
export const FOLLOWUP_QUESTIONS: Record<AeoProfileMissingField, string> = {
  name: "프로필 이름을 짧게 알려주세요. (예: '성분 전문가', '인테리어 박사')",
  category: "어떤 분야의 전문가신가요? (예: '바디·헤어케어', '인테리어 시공')",
  oneLineIntro:
    "본인(또는 브랜드)을 한 줄로 어떻게 소개하시겠어요? (예: '민감성 피부를 위해 안전한 성분으로 제품을 만드는 전문가')",
  experience:
    "본인이 겪은 직접적인 경험을 한 줄로 알려주세요. (예: '8년간 바디·헤어케어 제품 브랜딩 및 판매')",
  credentials:
    "가진 자격이나 경력을 알려주세요. 한 줄에 하나씩 (예: '8년 운영', '누적 판매 1만 개', '자체 임상 6개월')",
  audience:
    "어떤 분들에게 도움을 주고 싶으세요? 구체적일수록 좋아요. (예: '민감성 피부로 제품 선택에 어려움 겪는 분들')",
  recommendationCriteria:
    "추천하실 때 무엇을 가장 중요하게 보세요? 우선순위대로 알려주세요. (예: '1.안전한 성분  2.임상 결과  3.식약처 등재')",
  trustedSources:
    "자주 인용하는 권위 있는 출처가 있으세요? (예: '식약처, 대한피부과학회')",
  forbidden:
    "글에서 절대 쓰지 말아야 할 표현이 있어요? 쉼표로 구분 (예: '완치, 치료, 특허')",
};

export interface BuildProfileAssistPromptOptions {
  /** 사용자가 자유롭게 입력한 자기소개 */
  freeformInput: string;
}

export function buildProfileAssistPrompt(opts: BuildProfileAssistPromptOptions): string {
  return `당신은 AEO(Answer Engine Optimization) 블로그 작성자의 프로필을 정리해주는 친절한 도우미입니다.

# 임무
아래 사용자가 자유롭게 쓴 자기소개를 받아, AEO 프로필 8칸으로 변환하세요.

**적극 채우기 원칙:**
- 입력에 단어가 그대로 있지 않아도, **입력의 단서로 합리적 추론이 가능하면 채워주세요**.
- 예: 입력에 "바디·헤어케어 8년 운영"이 있으면:
  · category → "바디·헤어케어"
  · experience → "8년간 바디·헤어케어 제품 운영" (재구성)
  · oneLineIntro → 입력에 정체성 단서가 있으면 한 줄로 정리
  · audience → 같은 도메인의 일반적 타겟 추론 (예: "민감 피부 고객")
  · recommendationCriteria → 도메인 전문가의 일반적 판단 기준 (예: "안전한 성분", "임상 결과")
- 도메인 일반 지식을 적극 활용하되, **사용자 입력에 근거를 둔** 추론만. 새 사실을 만들어내지 마세요.

# 사용자 자기소개
"""
${opts.freeformInput.trim()}
"""

# 8칸 정의

[1] name : 프로필 이름 (한 단어 또는 짧은 호칭). 입력에 명시적 호칭이 없으면 카테고리에서 유추 (예: 바디·헤어케어 → "성분 전문가")
[2] category : 어떤 분야의 전문가인가 (예: "바디·헤어케어", "30대 직장인 가전")
[3] oneLineIntro : 본인(또는 브랜드)을 한 줄로 소개. **정체성을 한 문장으로** (예: "민감성 피부를 위해 안전한 성분으로 바디·헤어케어 제품을 만드는 전문가")
[4] identity:
    - experience : 직접 경험을 한 줄로 (예: "8년간 바디·헤어케어 제품 브랜딩 및 판매, 민감성 피부 직접 경험")
    - credentials : 자격·경력 목록 (배열). 입력에서 발견되는 만큼 + 도메인 추론 가능한 경력 추가
[5] audience : 누구에게 도움을 주는가 (구체적 타겟 묘사. 예: "민감성 피부로 제품 선택에 어려움 겪는 분들")
[6] recommendationCriteria : 추천 시 따지는 기준 (배열, 위→아래가 우선순위). **추천 철학**. 입력에 안 보여도 도메인 기반으로 합리적 기본 기준 추론
[7] trustedSources : 자주 인용하는 권위 출처 (배열). 입력에 있으면 그대로, 없으면 도메인별 일반 출처 추천:
    · 바디·헤어케어·화장품 → ["식약처 화장품 성분 안전성 정보", "대한피부과학회"]
    · 의료·헬스 → ["식약처 의약외품 고시", "Cochrane Library", "대한의학회"]
    · 그 외 도메인 → 입력에 단서 없으면 빈 배열
[8] forbidden:
    - enabled : true 고정
    - words : 절대 쓰지 말아야 할 표현 (배열). 입력에서 안 보이면 카테고리 기반 자동 추천:
        · 바디·헤어케어·화장품 → ["완치", "치료", "특허", "독점"]
        · 의료·헬스 → ["처방", "치료", "완치", "특허", "독점"]
        · 여행 → ["최저가 보장", "단독", "유일"]
        · 그 외 → ["최고", "최저", "1위" 등 단정적 표현]

# label 필드
label은 \`name + " (" + category + ")"\` 형태로 자동 조합. 예: "성분 전문가 (바디·헤어케어)"
또는 name이 이미 충분히 식별가능하면 label = name 그대로.

# missingFields 판정 기준 (객관적 임계값)

다음 칸에 대해 **입력에서 단서가 0개**인 경우에만 missingFields에 포함하세요.
단서가 1개라도 있으면(직접 명시 또는 합리적 추론 가능) 채우고 missingFields에서 제외.

- name: 호칭·정체성 단서 0개 → missing
- category: 분야 단서 0개 → missing
- oneLineIntro: 정체성·소개 단서 0개 → missing
- experience: 경력·역할 단서 0개 → missing
- credentials: 자격·연차 단서 0개 → missing
- audience: 타겟 단서 0개 → missing (단, 도메인이 명확하면 일반 타겟으로 추론 가능)
- recommendationCriteria: 추천 철학 단서 0개 → missing (단, 도메인이 명확하면 일반 기준으로 추론 가능)
- trustedSources: 출처 단서 0개 + 도메인 추론도 불가능 → missing
- forbidden: 자동 추천했으면 missing 아님.

**중요**: 위 기준은 "사용자가 직접 적은 단어"만 보지 말고, "추론 가능 여부"로 판단. 추론 가능하면 채워라.

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)

{
  "label": "<문자열>",
  "name": "<문자열, 단서 0개면 빈 문자열>",
  "category": "<문자열, 단서 0개면 빈 문자열>",
  "oneLineIntro": "<문자열, 단서 0개면 빈 문자열>",
  "identity": {
    "experience": "<문자열, 단서 0개면 빈 문자열>",
    "credentials": [<문자열, 단서 0개면 빈 배열>]
  },
  "audience": "<문자열, 단서 0개면 빈 문자열>",
  "recommendationCriteria": [<문자열, 단서 0개면 빈 배열>],
  "trustedSources": [<문자열, 도메인 기반 추천 또는 단서 0개면 빈 배열>],
  "forbidden": {
    "enabled": true,
    "words": [<문자열, 도메인 기본값 자동 추천>]
  },
  "missingFields": [<위 정의대로 단서 0개인 필드 이름 배열>]
}`;
}
