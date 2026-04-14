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
너는 네이버 블로그 SEO에 최적화된 제목을 만드는 전문가야.
후기성 블로그 글의 제목 7개를 만들어줘.

## 조건
- 메인 키워드: "${mainKeyword}"
${subKeywords ? `- 서브 키워드: ${subKeywords}` : ""}
- 관련 제품: ${productNames}
${persona ? `- 글쓴이 페르소나: ${persona}` : ""}

## 제목 생성 기법 (각 기법별 1개씩, 총 7개)

1. **호기심 유발형**: 독자가 "뭔데?" 하고 클릭하게 만드는 제목
   - 예: "○○ 때문에 5년 고생했는데... 이게 답이었음?"

2. **고정관념 활용형**: 일반적인 생각을 뒤집거나 활용
   - 예: "○○ 비싼 거 쓰면 좋은 줄 알았는데 아니었음"

3. **반전/서프라이즈형**: 기대와 다른 결과를 암시
   - 예: "약국에서 ○○ 사다가 결국 이걸로 바꾼 이유"

4. **숫자 활용형**: 구체적인 숫자로 신뢰감
   - 예: "○○ 3개월 써본 후기 + 전후 비교"

5. **독심술형**: 독자의 고민을 대변
   - 예: "나만 ○○ 고민하는 거 아니었구나..."

6. **위협/손실회피형**: 모르면 손해라는 느낌
   - 예: "○○ 아무거나 쓰면 안 되는 이유 (경험담)"

7. **권위 인용형**: 전문가나 경험의 권위 활용
   - 예: "피부과 3군데 다녀본 사람이 결국 선택한 ○○"

## 규칙
- 제목에 제품 브랜드명은 넣지 말 것
- 메인 키워드 "${mainKeyword}"를 자연스럽게 포함
- 네이버 블로그 제목 특성: 30자 이내 권장
- 광고 느낌 나는 제목 금지 ("인생템", "찐추천" 등)
- 클릭하고 싶은 궁금증을 유발하는 제목

## 출력 형식
JSON 배열로 반환해. 다른 텍스트 없이 JSON만 출력해.
[
  {"title": "제목1", "type": "호기심 유발형"},
  {"title": "제목2", "type": "고정관념 활용형"},
  ...
]`;
}
