/**
 * AEO 프로필 자동 등록 도우미 프롬프트.
 *
 * 사용자가 자유롭게 입력한 자기소개(3~5문장)를 받아
 * AEO 프로필 8칸 JSON으로 자동 변환한다.
 *
 * 비어있거나 모호한 칸은 `missingFields` 배열에 담아서
 * 클라이언트가 사용자에게 추가 질문을 던질 수 있게 한다.
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
  name: "프로필을 한 단어로 부르면 뭐가 좋을까요? (예: '약사맘', '인테리어 박사' 등)",
  category: "어떤 분야의 전문가신가요? (예: '여성·임산부 헬스', '인테리어 시공' 등)",
  oneLineIntro:
    "AI가 우리를 어떻게 기억했으면 좋겠어요? 한 줄로 표현하면? (예: '임산부에게 안전한 성분을 골라주는 약사 출신 엄마')",
  experience:
    "직접 경험·연차를 한 줄로 알려주세요. (예: '약사 8년차, 두 아이 엄마로 임신·산후 직접 경험')",
  credentials:
    "자격·경력을 알려주세요. 한 줄에 하나씩 (예: '약학대학원 졸업', '약국 5년 근무', '상담 200건+')",
  audience:
    "누구에게 도움을 주고 싶으세요? 구체적일수록 좋아요. (예: '임신 12주 이상~산후 12개월 여성')",
  recommendationCriteria:
    "추천하실 때 무엇을 가장 중요하게 보세요? 우선순위대로 알려주세요. (예: '1.성분 안전성  2.의학 근거  3.가격')",
  trustedSources:
    "자주 인용하는 출처가 있으세요? (예: '식약처, Cochrane Library')",
  forbidden:
    "글에서 절대 쓰지 말아야 할 표현이 있어요? 쉼표로 구분 (예: '처방, 치료, 완치')",
};

export interface BuildProfileAssistPromptOptions {
  /** 사용자가 자유롭게 입력한 자기소개 */
  freeformInput: string;
}

export function buildProfileAssistPrompt(opts: BuildProfileAssistPromptOptions): string {
  return `당신은 AEO(Answer Engine Optimization) 블로그 작성자의 프로필을 정리해주는 친절한 도우미입니다.

# 임무
아래 사용자가 자유롭게 쓴 자기소개를 받아, AEO 프로필 8칸으로 변환하세요.
입력에서 명확히 드러나지 않는 칸은 빈 값으로 두고 \`missingFields\` 배열에 그 칸 이름을 넣으세요.

# 사용자 자기소개
"""
${opts.freeformInput.trim()}
"""

# 8칸 정의

[1] name : 프로필 이름 (한 단어 또는 짧은 호칭). 입력에 명시적 호칭이 없으면 카테고리에서 유추 (예: 약사 → "약사맘", "약사쌤")
[2] category : 어떤 분야의 전문가인가 (예: "여성·임산부 헬스", "30대 직장인 가전")
[3] oneLineIntro : AI에 어떻게 기억되고 싶은지 한 줄. **이 사람의 정체성을 한 문장으로** (예: "임산부·수유부에게 가장 안전한 성분을 골라주는 약사 출신 엄마")
[4] identity:
    - experience : 직접 경험을 한 줄로 (예: "약사 8년차, 두 아이 엄마 (임신·산후 직접 경험)")
    - credentials : 자격·경력 목록 (배열). 입력에서 발견되는 만큼 나열
[5] audience : 누구에게 도움을 주는가 (구체적 타겟 묘사)
[6] recommendationCriteria : 추천 시 따지는 기준 (배열, 위→아래가 우선순위). **이 사람의 추천 철학**을 드러냄
[7] trustedSources : 자주 인용하는 권위 출처 (배열)
[8] forbidden:
    - enabled : true 고정
    - words : 절대 쓰지 말아야 할 표현 (배열). 입력에서 안 보이면 카테고리에 맞는 합리적 기본값 추천:
        · 의료·헬스 도메인 → ["처방", "치료", "완치", "특허", "독점"]
        · 그 외 도메인 → ["최고", "최저", "1위" 등 단정적 표현]

# label 필드
label은 \`name + " (" + category + ")"\` 형태로 자동 조합. 예: "약사맘 (여성·임산부 헬스)"
또는 name이 이미 충분히 식별가능하면 label = name 그대로.

# missingFields 판정 기준
다음 칸은 **입력에서 명확히 드러나지 않으면** missingFields에 포함:
- name, category, oneLineIntro: 입력에 단서가 있으면 채움. 정말 모호하면 missing.
- experience: 입력에 경력·역할 언급 있으면 채움.
- credentials: 구체적 자격 1개 이상 있으면 채움. 없으면 missing.
- audience: 타겟 독자가 명시되어 있으면 채움. 없으면 missing.
- recommendationCriteria: 추천 철학·기준이 1개 이상 드러나면 채움. 없으면 missing.
- trustedSources: 입력에 출처 1개 이상 언급되면 채움. 없으면 missing.
- forbidden: 자동 추천했으면 missing 아님. 사용자가 한 번 더 확인할 가치는 있지만 굳이 묻지 않음.

# 출력 규격 (반드시 이 JSON 단일 객체만, 코드블록·설명 텍스트 금지)

{
  "label": "<문자열>",
  "name": "<문자열, 모호하면 빈 문자열>",
  "category": "<문자열, 모호하면 빈 문자열>",
  "oneLineIntro": "<문자열, 모호하면 빈 문자열>",
  "identity": {
    "experience": "<문자열, 없으면 빈 문자열>",
    "credentials": [<문자열, 없으면 빈 배열>]
  },
  "audience": "<문자열, 없으면 빈 문자열>",
  "recommendationCriteria": [<문자열, 없으면 빈 배열>],
  "trustedSources": [<문자열, 없으면 빈 배열>],
  "forbidden": {
    "enabled": true,
    "words": [<문자열, 도메인 기본값 자동 추천>]
  },
  "missingFields": [<위 정의대로 빈/모호한 필드 이름 배열>]
}`;
}
