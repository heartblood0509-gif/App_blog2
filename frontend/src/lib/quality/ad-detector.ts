/**
 * 광고성 표현 탐지기
 * 체험단 클리셰, 과장 표현, 직접 추천 등을 감지
 */

const CLICHE_EXPRESSIONS = [
  "드디어 찾았다",
  "운명적인 만남",
  "진심으로 추천",
  "꼭 경험해보세요",
  "기쁨을 누리시길",
  "인생템",
  "딱 이거다 싶었",
  "제대로 된 제품을 찾은",
  "갓성비",
  "찐추천",
  "강력 추천",
  "꼭 사세요",
  "안 사면 후회",
  "지금 바로 구매",
  "링크 클릭",
];

const EXAGGERATION_PATTERNS = [
  "완전 달라졌",
  "기적 같은",
  "효과 미쳤",
  "바로 효과",
  "갑자기 좋아졌",
  "즉각적인 변화",
  "완벽한 제품",
  "최고의 제품",
  "최강",
];

const EXCESSIVE_PUNCTUATION = /[!]{2,}|[?]{3,}/g;

export function detectAdExpressions(text: string): string[] {
  const detected: string[] = [];

  for (const expr of CLICHE_EXPRESSIONS) {
    if (text.includes(expr)) {
      detected.push(`클리셰: "${expr}"`);
    }
  }

  for (const pattern of EXAGGERATION_PATTERNS) {
    if (text.includes(pattern)) {
      detected.push(`과장: "${pattern}"`);
    }
  }

  const punctMatches = text.match(EXCESSIVE_PUNCTUATION);
  if (punctMatches) {
    detected.push(`과도한 문장부호: ${punctMatches.join(", ")}`);
  }

  return detected;
}
