import type { NarrativeType } from "@/types";

interface NarrativeTemplate {
  id: NarrativeType;
  name: string;
  description: string;
  steps: { step: number; label: string; description: string }[];
  exampleFlow: string;
}

export const NARRATIVE_TEMPLATES: Record<NarrativeType, NarrativeTemplate> = {
  "empathy-first": {
    id: "empathy-first",
    name: "감정 선공형",
    description:
      "공감 먼저 때리는 구조. 스트레스 상황으로 시작해서 독자의 공감을 얻은 뒤, 자연스럽게 해결 과정으로 이어지는 흐름.",
    steps: [
      {
        step: 1,
        label: "스트레스 상황",
        description:
          "일상에서 겪는 불편함/스트레스를 구체적으로 묘사. 독자가 '나도 그래!'라고 느낄 수 있도록.",
      },
      {
        step: 2,
        label: "문제 인식",
        description:
          "처음에는 대수롭지 않게 넘겼지만 점점 신경 쓰이기 시작하는 과정.",
      },
      {
        step: 3,
        label: "증상 악화",
        description:
          "반복되면서 점점 심해지는 상황. 일상에서의 구체적인 불편함 (옷, 시선, 생활 등).",
      },
      {
        step: 4,
        label: "해결 시도",
        description:
          "유명한 제품이나 연고 등을 시도해봄. 검색해서 알아보는 과정 포함.",
      },
      {
        step: 5,
        label: "실패 경험",
        description:
          "처음엔 괜찮은 것 같았지만 결국 다시 원래대로. 강한 제품/순한 제품 각각의 문제점.",
      },
      {
        step: 6,
        label: "깨달음",
        description:
          "'없애는 게 아니라 원인을 봐야겠다'는 인식 변화. 제품 선택 기준이 바뀌는 계기.",
      },
      {
        step: 7,
        label: "기준 변화",
        description:
          "자극적인 것 → 순한 것, 보습/편안함 중심으로 제품 선택 기준이 변화.",
      },
      {
        step: 8,
        label: "제품 발견",
        description:
          "'우연히 써봤는데 계속 쓰게 됐음' 톤. 강제적이지 않은 자연스러운 계기.",
      },
      {
        step: 9,
        label: "1개월차 변화",
        description:
          "자극 감소, 안정감. '확 체감은 아닌데 달라짐' 패턴. 감각적 디테일 묘사.",
      },
      {
        step: 10,
        label: "2개월차 변화",
        description:
          "눈에 보이는 변화. 일상 행동/습관의 변화로 효과를 보여줌 (수치 아님).",
      },
      {
        step: 11,
        label: "루틴 정착",
        description: "현재 유지하고 있는 루틴 소개. 구체적인 사용 순서.",
      },
      {
        step: 12,
        label: "핵심 메시지",
        description:
          "'내 두피/피부에 맞는 게 중요하다'는 깨달음. 공감 + 조언.",
      },
      {
        step: 13,
        label: "결론 + 해시태그",
        description: "간단한 마무리와 해시태그 8개.",
      },
    ],
    exampleFlow:
      "스트레스 → 무시 → 악화 → 시도 → 실패 → 깨달음 → 기준변화 → 발견 → 1개월 → 2개월 → 루틴 → 메시지 → 마무리",
  },
  "conclusion-first": {
    id: "conclusion-first",
    name: "결론 선공형",
    description:
      "결과 먼저 보여주는 구조. '지금은 괜찮아졌다'로 시작해서 어떻게 여기까지 왔는지 과거를 회상하는 흐름.",
    steps: [
      {
        step: 1,
        label: "현재 상태",
        description:
          "개선된 현재 모습을 먼저 보여줌. '지금은 이런 고민 없다' 톤.",
      },
      {
        step: 2,
        label: "과거 문제",
        description:
          "예전에 겪었던 문제를 회상. '돌이켜보면 그때가 제일 힘들었음'.",
      },
      {
        step: 3,
        label: "당시 스트레스",
        description:
          "그때의 감정과 스트레스를 구체적으로 묘사. 공감 포인트 집중.",
      },
      {
        step: 4,
        label: "시도했던 것들",
        description:
          "이것저것 시도해봤던 과정. 검색, 후기, 유명 제품 등.",
      },
      {
        step: 5,
        label: "실패 이유",
        description:
          "왜 효과가 없었는지. '좋다는 것도 나한테 안 맞으면 의미 없음'.",
      },
      {
        step: 6,
        label: "깨달음",
        description:
          "생각이 바뀐 계기. 근본 원인을 이해하게 된 과정.",
      },
      {
        step: 7,
        label: "바뀐 접근",
        description:
          "새로운 기준으로 제품을 선택한 과정. 자연스러운 제품 발견.",
      },
      {
        step: 8,
        label: "변화 과정",
        description:
          "점진적으로 달라진 과정. 감각적 디테일과 일상 변화.",
      },
      {
        step: 9,
        label: "결론 + 해시태그",
        description:
          "핵심 메시지 정리 + 해시태그 8개.",
      },
    ],
    exampleFlow:
      "현재(좋아짐) → 과거 회상 → 스트레스 → 시도들 → 실패 → 깨달음 → 새로운 접근 → 변화 → 마무리",
  },
};

export function getNarrativePrompt(type: NarrativeType): string {
  const template = NARRATIVE_TEMPLATES[type];
  const stepsText = template.steps
    .map(
      (s) =>
        `[${s.step}단계: ${s.label}]\n내용: ${s.description}`
    )
    .join("\n\n");

  return `## 서사 구조: ${template.name}
설명: ${template.description}

### 글의 흐름 (이 순서를 반드시 따를 것)
${stepsText}

### 흐름 요약
${template.exampleFlow}`;
}
