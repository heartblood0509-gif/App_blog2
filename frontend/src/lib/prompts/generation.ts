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
- 소제목은 ## 형식으로 4~5개 배치하되 다양한 스타일로 (질문형 상황묘사형 감정형 반전형 등)
- 글 마지막에 해시태그 8개
- 짧은 문장 위주로 자주 줄바꿈
- 2~4줄마다 문단 나누기
- 제품은 글의 60~70% 지점에서 자연스럽게 등장
- "키워드"라는 단어 자체를 사용하지 말 것
- 네이버 금칙어 피하기: 치료 완치 처방 약효 부작용 무료 공짜
- 글의 시작은 제목 없이 본문부터 바로
- ⛔ 본문을 > 로 감싸지 마세요. 인용구는 소제목(##) 전용입니다

## 소제목 인용구 스타일 선택 규칙
소제목(##)을 쓸 때, 내용의 성격에 어울리는 인용구 스타일을 직접 골라서 ##\{스타일\} 형식으로 지정하세요.

| 소제목 성격 | 스타일 | 형식 |
|---|---|---|
| 대화체/누군가의 말 | bubble | ##\{bubble\} 소제목 |
| 핵심 포인트/팁/정리 | postit | ##\{postit\} 소제목 |
| 감정 전환/스토리 흐름 | line | ##\{line\} 소제목 |
| 결론/요약/마무리 | underline | ##\{underline\} 소제목 |
| 명언/격언/강조 | default | ##\{default\} 소제목 |
| 비교/분석/구조적 | corner | ##\{corner\} 소제목 |

- 6가지 스타일을 다양하게 사용하되, 한 글 안에서 같은 스타일이 연속되지 않도록 하세요
- 스타일 선택이 어려우면 ## 소제목 (스타일 없이)으로 쓰세요. 자동 배정됩니다

## 이미지 배치 (반드시 지켜 — 2단계 순서대로)
본문에 \`[이미지: 구체적 시각 묘사]\` 형식의 마커를 삽입합니다. 아래 2단계를 순서대로 수행하세요.

### 1단계: 소제목 커버리지 (절대 누락 금지)
- 글에 소제목(## 로 시작하는 줄)이 N개 있으면, **각 소제목 바로 다음 줄에 마커 1개씩 총 N개**를 반드시 배치합니다
- 형식 예:
  \`\`\`
  ##\{line\} 소제목

  [이미지: 구체적 시각 묘사]

  본문 문장들...
  \`\`\`
- 이 규칙은 **예외 없음**. 자연스러움보다 우선합니다
- 본문을 다 쓴 후 소제목 개수를 세고, 각 소제목 바로 아래에 마커가 있는지 반드시 검산하세요

### 2단계: 잔여 이미지 분산 (총 8~10장 목표)
- 1단계로 N개를 배치한 후, 남은 (8 - N) ~ (10 - N) 개를 아래 위치에 배치합니다:
  - 글의 **첫 문단 직후** (도입 이미지 역할)
  - **500자 이상** 이어지는 긴 본문 중간
  - **전/후 비교** 구간 (연속 2개 마커, 사이에 빈 줄만)
  - **감정 피크/반전** 지점 (독자가 멈출 만한 순간)

### 마커 작성 규칙
- 피사체·구도·조명·감정까지 구체적으로 묘사
  - 좋은 예: \`[이미지: 욕실 거울 앞에서 젖은 머리를 수건으로 털어내는 30대 여성, 자연광, 근심 어린 표정]\`
  - 나쁜 예: \`[이미지: 제품 사진]\`, \`[이미지: 깨끗한 느낌]\` (추상적 금지)
- 마커 줄 앞뒤에 반드시 **빈 줄 1줄씩** 확보
- 마커는 **본문 안에만**. 해시태그·제목 안에는 넣지 말 것

### 검산 체크리스트 (글 완성 전에 확인)
1. 소제목(##) N개 → 각 바로 아래에 마커 있는가? (없으면 추가)
2. 총 마커 수가 8~10개인가?
3. 대비 구간이 아닌 마커는 단독(앞뒤에 본문 최소 1문장)인가?
4. 본문에 > 로 시작하는 줄이 없는가? (있으면 > 제거)`);

  return sections.join("\n\n");
}
