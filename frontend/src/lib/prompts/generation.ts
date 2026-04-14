import type { NarrativeType, ToneType, SelectedProduct } from "@/types";
import { getTonePrompt } from "./tone-rules";
import { buildProductContext } from "./product-placement";
import { DEFAULT_REFERENCE } from "./default-reference";

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
    toneType,
    toneExample,
    mainKeyword,
    subKeywords,
    persona,
    requirements,
    selectedTitle,
    referenceAnalysis,
  } = params;

  const sections: string[] = [];

  // ──────────────────────────────────────
  // 섹션 1: 역할 + 필수 규칙 4개
  // ──────────────────────────────────────
  sections.push(`# 역할
너는 실제 경험을 자연스럽게 풀어쓰는 후기성 블로그 작가야
아래 레퍼런스 글의 톤과 흐름을 따라서 새로운 글을 써

## 반드시 지킬 것 (이 4가지만 확실히 지켜)

1. 아래 레퍼런스 글의 톤과 흐름과 자연스러움을 따라 써
   규칙을 의식하지 말고 경험을 풀어쓰듯 자연스럽게

2. 메인 키워드 "${mainKeyword}"를 글 전체에 5회 이상 자연스럽게 녹여

3. 광고 느낌 절대 금지
   읽는 사람이 "이거 광고 아닌가" 라고 느끼면 실패

4. 문장부호 사용 금지
   마침표 쉼표 느낌표 물음표 따옴표 전부 사용하지 말 것`);

  // ──────────────────────────────────────
  // 섹션 2: 레퍼런스 글 (톤/구조의 기준점)
  // ──────────────────────────────────────
  if (referenceAnalysis) {
    sections.push(`## 레퍼런스 (이 글의 톤과 흐름을 따라 써)
내용을 복사하지 말고 느낌만 참고해

${referenceAnalysis}`);
  } else {
    sections.push(`## 레퍼런스 (이 글의 톤과 흐름을 따라 써)
내용을 복사하지 말고 느낌만 참고해

${DEFAULT_REFERENCE}`);
  }

  // ──────────────────────────────────────
  // 섹션 3: 제품 정보 + 실제 후기
  // ──────────────────────────────────────
  const productContext = buildProductContext(products);
  if (productContext) {
    sections.push(productContext);
  }

  // ──────────────────────────────────────
  // 섹션 4: 사용자 설정
  // ──────────────────────────────────────
  const userInput: string[] = [`## 이 글의 조건`];
  userInput.push(`- 제목: ${selectedTitle}`);
  userInput.push(`- 메인 키워드: ${mainKeyword}`);
  if (subKeywords) userInput.push(`- 서브 키워드: ${subKeywords}`);
  if (persona) userInput.push(`- 글쓴이: ${persona}`);
  if (requirements) userInput.push(`- 추가 요청: ${requirements}`);

  // 말투
  const toneLabel = toneType === "존댓말" ? "존댓말 (친한 언니/형 느낌)" :
    toneType === "반말" ? "반말 (동갑 친구 느낌)" : "음슴체 (커뮤니티 후기 느낌)";
  userInput.push(`- 말투: ${toneLabel}`);

  if (toneExample) {
    userInput.push(`- 말투 예시 (이 톤을 따라):\n${toneExample}`);
  }

  sections.push(userInput.join("\n"));

  // ──────────────────────────────────────
  // 섹션 5: 참고 사항 (후순위)
  // ──────────────────────────────────────
  sections.push(`## 참고 사항 (가능하면 따르되 자연스러움이 우선)
- 소제목은 > 형식으로 4~5개 배치하되 다양한 스타일로 (질문형 상황묘사형 감정형 반전형 등)
- 글 마지막에 해시태그 8개
- 짧은 문장 위주로 자주 줄바꿈
- 2~4줄마다 문단 나누기
- 제품은 글의 60~70% 지점에서 자연스럽게 등장
- "키워드"라는 단어 자체를 사용하지 말 것
- 네이버 금칙어 피하기: 치료 완치 처방 약효 부작용 무료 공짜
- 글의 시작은 제목 없이 본문부터 바로`);

  return sections.join("\n\n");
}
