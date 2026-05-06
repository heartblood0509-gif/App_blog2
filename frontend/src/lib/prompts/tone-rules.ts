import type { ToneType } from "@/types";

interface ToneRule {
  type: ToneType;
  endingPatterns: string[];
  description: string;
  exampleParagraph: string;
  promptInstruction: string;
}

export const TONE_RULES: Record<ToneType, ToneRule> = {
  존댓말: {
    type: "존댓말",
    endingPatterns: [
      "~해요",
      "~거든요",
      "~더라고요",
      "~잖아요",
      "~인 거죠",
      "~었어요",
      "~나요",
      "~네요",
    ],
    description:
      "존댓말 구어체. 친한 언니/형이 카페에서 조언해주는 느낌. 딱딱하지 않고 부드럽고 친근한 존댓말.",
    exampleParagraph: `처음에는 그냥 그러려니 했거든요
별로 심각하게 생각 안 했어요
근데 어느 순간부터 계속 신경 쓰이기 시작했어요
이게 반복되니까 스트레스가 쌓이더라고요
그래서 이것저것 알아보기 시작했어요`,
    promptInstruction: `## 말투 규칙: 존댓말
- 문장 끝: ~해요, ~거든요, ~더라고요, ~잖아요, ~었어요, ~네요 등 존댓말 구어체 사용
- 느낌: 친한 언니/형이 카페에서 편하게 조언해주는 느낌
- 절대 ~합니다, ~습니다 같은 경어체 사용 금지 (너무 딱딱함)
- 자연스럽고 부드러운 존댓말 구어체 유지
- 예시: "저도 처음엔 그랬거든요", "이게 은근 차이가 크더라고요", "그래서 바꿔봤어요"`,
  },
  반말: {
    type: "반말",
    endingPatterns: [
      "~했어",
      "~거든",
      "~더라",
      "~잖아",
      "~인 거지",
      "~었어",
      "~는데",
      "~아/어",
    ],
    description:
      "반말 구어체. 같은 또래 친구한테 편하게 얘기하는 느낌. 거리감 없고 솔직한 톤.",
    exampleParagraph: `처음에는 그냥 그러려니 했거든
별로 심각하게 생각 안 했어
근데 어느 순간부터 계속 신경 쓰이기 시작했어
이게 반복되니까 스트레스가 쌓이더라
그래서 이것저것 알아보기 시작했어`,
    promptInstruction: `## 말투 규칙: 반말
- 문장 끝: ~했어, ~거든, ~더라, ~잖아, ~었어, ~는데 등 반말 구어체 사용
- 느낌: 같은 나이 친구한테 편하게 얘기하는 느낌
- 너무 거친 반말은 금지 (비속어, 은어 등)
- 자연스럽고 친근한 반말 유지
- 예시: "나도 처음엔 그랬거든", "이게 은근 차이가 크더라", "그래서 바꿔봤어"`,
  },
  음슴체: {
    type: "음슴체",
    endingPatterns: [
      "~했음",
      "~이었음",
      "~인 듯",
      "~더라",
      "~그래서",
      "~하는 중",
      "~임",
      "~됨",
    ],
    description:
      "음슴체. 커뮤니티 후기 느낌. 매우 짧은 문장, 건조하지만 솔직하고 담백한 톤.",
    exampleParagraph: `처음엔 별 생각 없었음
그냥 그러려니 했음
근데 이게 계속 반복됨
점점 신경 쓰이기 시작했음
그래서 알아보기 시작함`,
    promptInstruction: `## 말투 규칙: 음슴체
- 문장 끝: ~했음, ~이었음, ~인 듯, ~임, ~됨, ~하는 중 등 음슴체 사용
- 느낌: 커뮤니티(에브리타임, 디시, 네이트판 등)에 후기 쓰는 느낌
- 건조하지만 솔직한 톤. 감정 표현도 담백하게
- 문장을 최대한 짧게. 한 문장에 하나의 정보만
- 예시: "처음엔 별 기대 안 했음", "근데 확실히 다름", "이게 은근 큼"`,
  },
  레퍼런스: {
    type: "레퍼런스",
    endingPatterns: [],
    description:
      "레퍼런스 그대로. 사용자 톤을 강제하지 않고 레퍼런스 글의 어미·말투를 그대로 따라감.",
    exampleParagraph: `선택한 레퍼런스 글의 어미·말투를 그대로 따라갑니다.
예: 레퍼런스가 "~거든요, ~더라고요, ~었어요"를 쓰면 그 패턴 그대로,
"~했음, ~인 듯"을 쓰면 그 패턴 그대로 작성됩니다.`,
    promptInstruction: `## 말투 규칙: 레퍼런스 그대로
- 사용자가 특정 어미를 강제하지 않습니다
- 위 "## 레퍼런스" 섹션 글의 **문장 끝 패턴(어미)을 그대로 따라가세요**
- 레퍼런스 분석 결과에 "주요 문장 끝 패턴"이 명시되어 있다면 그것을 우선 적용
- 자연스럽게 레퍼런스의 톤·말투·리듬을 흡수해서 같은 느낌으로 작성`,
  },
};

export function getTonePrompt(tone: ToneType): string {
  return TONE_RULES[tone].promptInstruction;
}

export function getToneExample(tone: ToneType): string {
  return TONE_RULES[tone].exampleParagraph;
}
