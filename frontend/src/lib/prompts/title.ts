import type { NarrativeType, ToneType, SelectedProduct } from "@/types";
import { BRAND_PRODUCTS } from "./brand-context";

interface TitleGenerationParams {
  products: SelectedProduct[];
  narrativeType: NarrativeType;
  toneType: ToneType;
  mainKeyword: string;
  subKeywords?: string;
  persona?: string;
}

export function buildTitlePrompt(params: TitleGenerationParams): string {
  const { products, mainKeyword, subKeywords, persona } = params;

  const productNames = products
    .map((p) => BRAND_PRODUCTS[p.id]?.name)
    .filter(Boolean)
    .join(", ");

  return `# 역할
너는 네이버 블로그 SEO에 최적화된 제목을 만드는 전문가야
후기성 블로그 글의 제목 6개를 만들어줘

## 핵심 규칙 (절대 어기지 말 것)
- 모든 제목은 반드시 메인 키워드 "${mainKeyword}"로 시작할 것
- 메인 키워드는 절대 중간이나 뒤에 배치하지 말 것
- 제목에 문장부호를 절대 사용하지 말 것 (마침표 쉼표 느낌표 물음표 따옴표 괄호 특수문자 전부 금지)

## 조건
- 메인 키워드: "${mainKeyword}"
${subKeywords ? `- 서브 키워드: ${subKeywords}` : ""}
- 관련 제품: ${productNames}
${persona ? `- 글쓴이 페르소나: ${persona}` : ""}

## 제목 구조
메인 키워드 + 문제 상황 경험 결과 후킹 요소

## 제목 스타일 규칙
- 자연스러운 문장형으로 작성
- 불필요한 기호 없이 가독성 좋게 구성
- 띄어쓰기와 단어만으로 의미 전달
- 사람이 실제 경험한 것처럼 자연스럽게 작성
- 광고 느낌 없이 신뢰 중심으로 구성

## 후킹 패턴 (각 패턴별 1개씩 총 6개)

1. **문제 제기형**: 문제 상황을 제시하여 공감 유도
   - 예: "${mainKeyword} 아무거나 쓰면 안 되는 이유를 알게 됨"

2. **공감형**: 독자의 고민을 대변
   - 예: "${mainKeyword} 때문에 고민이었는데 이렇게 해결했음"

3. **반전형**: 기대와 다른 결과를 암시
   - 예: "${mainKeyword} 비싼 거 쓰다가 결국 이걸로 바꾼 후기"

4. **후기형**: 실제 경험 기반 신뢰 구축
   - 예: "${mainKeyword} 3개월 써본 솔직 후기 정리"

5. **비교형**: 선택 기준을 비교하는 구조
   - 예: "${mainKeyword} 순한 거랑 강한 거 둘 다 써봤는데"

6. **경고형**: 모르면 손해라는 느낌
   - 예: "${mainKeyword} 고를 때 이것만은 꼭 확인해봐야 함"

## 금지 사항
- 문장부호 사용 절대 금지
- 같은 패턴 반복 금지
- 키워드 중간이나 뒤 배치 금지
- 제품 브랜드명 넣기 금지
- 광고 느낌 나는 제목 금지 ("인생템" "찐추천" 등)
- 30자 이내 권장

## 출력 형식
JSON 배열로 반환해 다른 텍스트 없이 JSON만 출력해
[
  {"title": "제목1", "type": "문제 제기형"},
  {"title": "제목2", "type": "공감형"},
  {"title": "제목3", "type": "반전형"},
  {"title": "제목4", "type": "후기형"},
  {"title": "제목5", "type": "비교형"},
  {"title": "제목6", "type": "경고형"}
]`;
}
