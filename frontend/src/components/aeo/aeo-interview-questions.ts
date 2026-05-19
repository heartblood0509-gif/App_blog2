/**
 * AEO 프로필 단계별 인터뷰 질문 8개.
 * 예시는 미르엔(성분 전문가, 바디·헤어케어) 케이스로 통일.
 *
 * 브랜드와 동일한 친절 서술문 톤.
 */
import type { InterviewQuestion } from "@/components/profile-assistant/step-interview";

export const AEO_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "name",
    label: "프로필 이름이 어떻게 되나요?",
    example: "성분 전문가",
    kind: "text",
    required: true,
  },
  {
    id: "category",
    label: "어떤 분야의 전문가이신가요?",
    example: "바디·헤어케어",
    kind: "text",
  },
  {
    id: "oneLineIntro",
    label: "본인(또는 브랜드)을 한 줄로 어떻게 소개하시겠어요?",
    example: "민감성 피부를 위해 안전한 성분으로 바디·헤어케어 제품을 만드는 전문가",
    kind: "textarea",
  },
  {
    id: "experience",
    label: "본인이 겪은 직접적인 경험을 알려주세요.",
    example: "8년간 바디·헤어케어 제품 브랜딩 및 판매, 민감성 피부 직접 경험",
    kind: "textarea",
  },
  {
    id: "credentials",
    label: "가진 자격이나 경력이 있다면 적어주세요. (한 줄에 하나씩)",
    example: "바디·헤어케어 브랜딩 8년\n누적 판매 1만 개 이상\n자체 임상 6개월 운영\n재구매율 35%",
    kind: "list",
  },
  {
    id: "audience",
    label: "어떤 분들에게 도움을 주고 싶으신가요?",
    example: "민감성 피부로 제품 선택에 어려움 겪는 분들",
    kind: "textarea",
  },
  {
    id: "recommendationCriteria",
    label: "추천할 때 가장 중요하게 보는 기준은 무엇인가요? (위→아래가 우선순위, 한 줄에 하나씩)",
    example: "안전한 성분 (자극 유발 성분 제외)\n민감성 피부도 안심하고 쓸 수 있는 제품\n자체 임상 결과\n식약처 등재 여부\n실사용자 후기",
    kind: "list",
  },
  {
    id: "trustedSources",
    label: "자주 인용하는 권위 있는 출처가 있나요? (한 줄에 하나씩)",
    example: "식약처 화장품 성분 안전성 정보\n대한피부과학회 가이드\nKCID 화장품 안전성 데이터베이스",
    kind: "list",
  },
];
