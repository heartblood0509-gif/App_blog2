import type { NarrativeType, ToneType, SelectedProduct } from "@/types";
import { getNarrativePrompt } from "./narrative-templates";
import { getTonePrompt } from "./tone-rules";
import { WRITING_STYLE_RULES, ABSOLUTE_FORBIDDEN_RULES } from "./writing-rules";
import { PRODUCT_PLACEMENT_RULES, buildProductContext } from "./product-placement";
import { NAVER_FORBIDDEN_WORDS_PROMPT } from "./naver-forbidden";

interface GenerationParams {
  products: SelectedProduct[];
  narrativeType: NarrativeType;
  toneType: ToneType;
  mainKeyword: string;
  subKeywords?: string;
  persona?: string;
  requirements?: string;
  charCount: { min: number; max: number };
  selectedTitle: string;
  referenceAnalysis?: string;
}

export function buildGenerationPrompt(params: GenerationParams): string {
  const {
    products,
    narrativeType,
    toneType,
    mainKeyword,
    subKeywords,
    persona,
    requirements,
    charCount,
    selectedTitle,
    referenceAnalysis,
  } = params;

  const sections: string[] = [];

  // 1. 시스템 역할
  sections.push(`# 역할
너는 한국에서 가장 자연스러운 후기성 블로그 글을 쓰는 전문 작가야.
실제 사람이 직접 겪은 경험을 바탕으로 쓴 것처럼, 광고 느낌이 전혀 없는 진짜 후기를 작성해야 해.
아래의 모든 규칙을 반드시 지켜서 글을 작성해.`);

  // 2. 서사 구조
  sections.push(getNarrativePrompt(narrativeType));

  // 3. 말투
  sections.push(getTonePrompt(toneType));

  // 4. 글쓰기 스타일 규칙
  sections.push(WRITING_STYLE_RULES);

  // 5. 절대 금지 사항
  sections.push(ABSOLUTE_FORBIDDEN_RULES);

  // 6. 제품 배치 규칙
  sections.push(PRODUCT_PLACEMENT_RULES);

  // 7. 제품 정보
  const productContext = buildProductContext(products);
  if (productContext) {
    sections.push(productContext);
  }

  // 8. 사용자 입력
  const userInput: string[] = ["## 사용자 설정"];
  userInput.push(`- 선택된 제목: ${selectedTitle}`);
  userInput.push(`- 메인 키워드: ${mainKeyword} (글 안에 4~5번 자연스럽게 포함)`);
  if (subKeywords) {
    userInput.push(`- 서브 키워드: ${subKeywords}`);
  }
  if (persona) {
    userInput.push(`- 글쓴이 페르소나: ${persona}`);
  }
  if (requirements) {
    userInput.push(`- 추가 요구사항: ${requirements}`);
  }
  sections.push(userInput.join("\n"));

  // 9. SEO & 포맷 규칙
  sections.push(`## SEO & 포맷 규칙
- 글자수: ${charCount.min}~${charCount.max}자 (공백 포함)
- 메인 키워드 "${mainKeyword}"를 글 전체에 4~5회 자연스럽게 분산 배치
- 소제목은 > (인용구) 형식으로 4~5개 배치
- 읽기 흐름이 끊기지 않게 구성
- 글 마지막에 해시태그 8개 작성 (# 형식)
- 짧은 문장 위주, 줄바꿈 자주 사용`);

  // 10. 네이버 금칙어
  sections.push(NAVER_FORBIDDEN_WORDS_PROMPT);

  // 11. 레퍼런스 분석 (선택사항)
  if (referenceAnalysis) {
    sections.push(`## 레퍼런스 스타일 참고 (구조와 톤만 참고, 내용 복사 금지)
${referenceAnalysis}`);
  }

  // 12. 최종 지시
  sections.push(`## 최종 지시
위의 모든 규칙을 지키면서, 제목 "${selectedTitle}"에 맞는 후기성 블로그 글을 작성해.
글의 시작은 제목 없이 본문부터 바로 시작해.
소제목은 > 형식으로 작성해.
마지막에 해시태그 8개를 넣어.
실제 사람이 쓴 것처럼 자연스럽고, 읽는 사람이 공감할 수 있는 글을 써.`);

  return sections.join("\n\n---\n\n");
}
