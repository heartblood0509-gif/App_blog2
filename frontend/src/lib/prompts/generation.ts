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
  toneExample?: string;
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
    toneExample,
    mainKeyword,
    subKeywords,
    persona,
    requirements,
    charCount,
    selectedTitle,
    referenceAnalysis,
  } = params;

  const sections: string[] = [];

  // 1. 시스템 역할 + 최우선 규칙
  sections.push(`# 역할
너는 한국에서 가장 자연스러운 후기성 블로그 글을 쓰는 전문 작가야.
실제 사람이 직접 겪은 경험을 바탕으로 쓴 것처럼, 광고 느낌이 전혀 없는 진짜 후기를 작성해야 해.
아래의 모든 규칙을 반드시 지켜서 글을 작성해.

## ★ 최우선 규칙 (이 규칙은 다른 모든 규칙보다 우선함)
메인 키워드 "${mainKeyword}"를 글 전체에서 반드시 5회 이상 포함할 것.
구체적인 삽입 위치:
- 도입부 (첫 2~3문단)에 1회
- 중반 문제 인식/시도 단계에 1~2회
- 후반 해결/변화 단계에 1~2회
- 결론 부분에 1회
키워드를 넣을 때 자연스러운 문맥 안에서 녹여서 넣을 것.
절대로 "키워드"라는 단어 자체를 사용하지 말 것.`);

  // 2. 서사 구조
  sections.push(getNarrativePrompt(narrativeType));

  // 3. 말투
  sections.push(getTonePrompt(toneType));

  // 3-1. 사용자 커스텀 말투 예시
  if (toneExample) {
    sections.push(`## 말투 참고 예시 (사용자가 직접 작성한 예시 — 이 톤을 최대한 따를 것)
${toneExample}`);
  }

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
- 글자수: ${charCount.min}~${charCount.max}자 (공백 제외 기준)
- 메인 키워드 "${mainKeyword}"를 글 전체에 4~5회 자연스럽게 분산 배치
- 소제목은 > (인용구) 형식으로 4~5개 배치
- 글 마지막에 해시태그 8개 작성 (# 형식)
- 문장부호 절대 금지 (마침표 쉼표 느낌표 물음표 따옴표 전부 사용 금지)
- 한 줄에 한 문장만 작성
- 2~4줄마다 반드시 빈 줄로 문단 나누기
- 5줄 이상 연속된 긴 문단 절대 금지
- 모바일에서 읽기 편한 짧은 호흡으로 구성`);

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
