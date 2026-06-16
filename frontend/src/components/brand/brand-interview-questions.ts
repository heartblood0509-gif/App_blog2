/**
 * 브랜드 프로필 단계별 인터뷰 질문 9개.
 * 예시는 미르엔(민감 피부 화장품) 도메인으로 통일.
 *
 * id는 LLM에 직렬화할 때 어느 필드를 채울지 매핑하는 데 쓰임.
 * 자세한 직렬화는 step-interview.tsx의 serializeInterviewAnswers 참고.
 */
import type { InterviewQuestion } from "@/components/profile-assistant/step-interview";

export const BRAND_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "name",
    label: "브랜드(회사) 이름이 뭔가요?",
    example: "미르엔",
    kind: "text",
    required: true,
  },
  {
    id: "category",
    label: "어떤 분야인가요?",
    example: "바디·헤어케어\n(또는: 크루즈 여행 공동구매, 민감 피부 화장품 등)",
    kind: "text",
  },
  {
    id: "oneLine",
    label: "브랜드를 한 줄로 표현하면 어떻게 되나요?",
    example: "민감 피부에 딱 맞는 자체 임상 화장품 브랜드",
    kind: "text",
  },
  {
    id: "narrator",
    label: "글을 쓰는 분(글쓴이)은 누구인가요?",
    example: "이름: 윤희\n직책: 대표",
    kind: "two-fields",
    fieldA: "이름",
    fieldB: "직책",
    required: true,
  },
  {
    id: "narratorAuthority",
    label: "글쓴이의 경력·자격을 알려주세요. (숫자·기간·횟수 위주로, 한 줄에 하나씩)",
    example: "미르엔 8년 운영\n누적 판매 1만 개\n자체 임상 6개월\n재구매율 35%",
    kind: "list",
  },
  {
    id: "storyOrigin",
    label: "이 브랜드를 시작하게 된 계기는 무엇이었나요?",
    example: "민감 피부 때문에 시중 제품이 안 맞아서 직접 안전한 성분으로 만들기 시작",
    kind: "textarea",
  },
  {
    id: "targetPrimary",
    label: "주 고객은 누구인가요?",
    example: "민감 피부로 제품 선택에 어려움 겪는 분들",
    kind: "text",
  },
  {
    id: "differentiators",
    label: "다른 곳과 비교했을 때 우리만의 강점은 무엇인가요? (한 줄에 하나씩)",
    example: "자체 임상 6개월\n재구매율 35%\n민감 피부 전문",
    kind: "list",
  },
  {
    id: "villains",
    label: "자주 폭로하고 싶은 업계의 잘못된 관행이 있나요? (3~5개 권장, 한 줄에 하나씩)",
    example: "성분 표기 속임\n과장 광고\n자연유래 소량만 첨가하고 주성분처럼 광고\n자극 성분을 '천연'으로 포장",
    kind: "list",
  },
  {
    id: "customerCases",
    label: "실제 고객 후기·사례가 있나요? (가치입증글의 '제3자 증명' 재료, 한 줄에 하나씩)",
    example: "두피 진정 효과 봤다며 재구매하신 분 많아요\n트러블 가라앉았다는 후기 다수\n온 가족이 같이 쓰는 단골님 사례",
    kind: "list",
  },
];
