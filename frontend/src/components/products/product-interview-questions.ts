/**
 * 후기성 블로그 — 제품 등록 인터뷰 질문.
 *
 * 사이클 4: 자유 텍스트 모드를 인터뷰 모드로 교체. 사용자가 1개씩 답하게.
 * 브랜드 어시스턴트(`brand-interview-questions.ts`)와 동일 패턴.
 *
 * - 예시는 미르엔 탈모샴푸(헤어케어) 도메인으로 통일.
 * - id는 LLM이 어떤 폼 필드를 채울지 매핑 + 직렬화 시 라벨로도 사용.
 * - 10번 질문은 출시 상태(hasReviews)에 따라 라벨/예시가 동적으로 바뀜.
 *
 * ⚠️ 환각 가드: "핵심 성분"은 "모르면 건너뛰세요" 명시 — 사용자가 직접 답해야 하는
 *    영역이라 LLM 추론으로 거짓 성분명을 만들면 위험. 브랜드와 동일하게 [잘 모르겠음]
 *    버튼으로 비워두면 product-assist 프롬프트가 추론 금지(현재 가드 그대로 작동).
 */
import type { InterviewQuestion } from "@/components/profile-assistant/step-interview";

/**
 * 후기성 인터뷰 질문 10개.
 * `hasReviews`에 따라 10번(reviewsOrReactions) 질문의 label/example만 동적으로 변경됨.
 *
 * @param hasReviews — true: 이미 출시된 제품(실제 후기 입력) / false: 신규 출시(예상 반응 입력)
 */
export function getProductInterviewQuestions(hasReviews: boolean): InterviewQuestion[] {
  return [
    {
      id: "name",
      label: "제품 이름이 뭔가요?",
      example: "미르엔 탈모샴푸",
      kind: "text",
      required: true,
    },
    {
      id: "category",
      label: "어떤 카테고리 제품인가요?",
      example: "헤어케어\n(또는: 바디케어, 헤어케어 도구, 스킨케어 등)",
      kind: "text",
    },
    {
      id: "productUrl",
      label: "판매 제품 URL이 있나요? (없으면 건너뛰세요)",
      example: "https://example.com/products/hair-shampoo",
      kind: "text",
    },
    {
      id: "keyInsight",
      label: "이 제품, 한마디로?",
      example: "탈모를 잡는다보다 빠질 환경을 줄이는 타입",
      kind: "text",
    },
    {
      id: "efficacy",
      label: "어떤 효과가 있나요?",
      example: "두피 열감 진정, 빠짐 환경 개선\n머리 감고 나서 두피 컨디션이 안정됨",
      kind: "textarea",
    },
    {
      // ⚠️ 환각 금지 영역 — label에 "모르면 건너뛰세요" 명시
      id: "ingredients",
      label: "핵심 성분은? (모르면 건너뛰세요)",
      example: "비오틴, 살리실산\n무실리콘",
      kind: "textarea",
    },
    {
      id: "usability",
      label: "쓸 때 어떤 느낌인가요?",
      example: "개운하지만 건조하지 않음\n기존 탈모샴푸 특유의 뻣뻣함이 덜함",
      kind: "textarea",
    },
    {
      id: "differentiator",
      label: "다른 제품과 뭐가 다른가요?",
      example: "탈모를 잡는다보다 빠질 환경을 줄이는 방향으로 접근",
      kind: "textarea",
    },
    {
      id: "usage",
      label: "어떻게 써야 좋나요?",
      example: "2회 푸시, 거품 충분히 낸 뒤 두피에 2분 마사지 후 헹굼",
      kind: "textarea",
    },
    {
      id: "precautions",
      label: "\"이런 분에게는 좀 부족할 수 있어요\"라고 한다면, 어떤 분일까요?",
      example: "건성 두피 분에게는 다소 가벼울 수 있어요\n향에 민감한 분은 무향 제품 추천",
      kind: "textarea",
    },
    // ─────── 10번: 출시 상태에 따라 동적 분기 ───────
    hasReviews
      ? {
          id: "reviewsOrReactions",
          label: "이 제품을 써본 분들이 어떤 말을 자주 했나요?",
          example:
            "꾸준히 썼을 때 차이가 나는 쪽\n기존 탈모샴푸처럼 뻣뻣하거나 떡지는 느낌 없음\n머리 빠지는 건 바로 줄진 않는데 두피가 덜 자극받으니까 덜 빠지는 느낌",
          kind: "list",
        }
      : {
          id: "reviewsOrReactions",
          label: "이 제품을 써보면 어떤 반응이 나올 것 같나요?",
          example:
            "처음 써본 사람은 \"확 잡아주는 느낌\"보다 \"두피가 편해지는 흐름\"이라고 느낄 듯\n꾸준히 쓰면 1~2주 후가 핵심",
          kind: "list",
        },
  ];
}
