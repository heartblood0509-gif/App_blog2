import type { NarrativeType } from "@/types";

export interface NarrativeValidationResult {
  passed: boolean;
  reason?: string;
}

/**
 * 본문 도입부가 선택된 narrativeType에 맞는지 검증.
 * 통과 기준은 넓게, 실패 기준은 엄격하게 설계해 오판을 최소화한다.
 * 오판으로 재생성 트리거되면 오히려 퀄리티 저하 우려.
 *
 * @param content 생성된 전체 본문 (HOOK 블록 포함)
 * @param narrativeType 선택된 서사 구조. null이면 검증 스킵.
 */
export function validateNarrativeOpening(
  content: string,
  narrativeType: NarrativeType | null | undefined
): NarrativeValidationResult {
  // custom-reference 모드: 검증 안 함, 항상 통과
  if (!narrativeType) return { passed: true };

  const firstParagraph = extractFirstParagraph(content);
  if (!firstParagraph) {
    // 첫 문단을 찾지 못하면 통과 처리 (본문 생성 실패는 별개 문제)
    return { passed: true };
  }

  if (narrativeType === "conclusion-first") {
    return validateConclusionFirst(firstParagraph);
  }
  if (narrativeType === "empathy-first") {
    return validateEmpathyFirst(firstParagraph);
  }
  return { passed: true };
}

/**
 * HOOK 블록(<HOOK>...</HOOK>)과 소제목/이미지 마커를 제거하고
 * 본문 첫 문단을 추출한다.
 */
function extractFirstParagraph(content: string): string {
  // 1) HOOK 블록 제거
  let body = content.replace(/<HOOK>[\s\S]*?<\/HOOK>/gi, "").trim();

  // 2) 빈 줄 기준 분리, 첫 번째 "실제 문단" 찾기
  //    (소제목 `## ...`, 이미지 마커 `[이미지: ...]`는 문단 아님)
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  for (const p of paragraphs) {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    // 모든 줄이 소제목 or 이미지 마커면 스킵
    const allNoise = lines.every(
      (l) => /^##/.test(l) || /^\[이미지:/.test(l)
    );
    if (allNoise) continue;
    // 노이즈 줄 제거 후 반환
    const cleanLines = lines.filter(
      (l) => !/^##/.test(l) && !/^\[이미지:/.test(l)
    );
    if (cleanLines.length > 0) {
      return cleanLines.join("\n");
    }
  }

  return "";
}

/**
 * 결론 선공형 검증.
 * - 통과 기준(넓게): 결론형 도입어 + 긍정 상태 키워드
 * - 실패 기준(엄격): 명확한 감정형 키워드가 있을 때만
 * - 애매하면 통과
 */
function validateConclusionFirst(
  firstParagraph: string
): NarrativeValidationResult {
  // 결론형 도입어 패턴 (첫 문장 기준 — 넓게)
  const openingPatterns = [
    /^지금은\s/,
    /^이제는\s/,
    /^요즘은\s/,
    /^현재는\s/,
    /^바꾸고\s*나서/,
    /^바꾼\s*뒤/,
    /^올해(는|부터)?\s/,
    /^이제\s/,
  ];

  // 긍정 상태 키워드 (첫 문단 어디든)
  const positiveKeywords =
    /(괜찮|편안|여유|만족|안\s*신경|걱정\s*없|거의\s*없|확실히\s*달라|크게\s*변|달라졌|나아졌|편해졌|안정|줄어들었|없어졌)/;

  // 명확한 감정형 실패 패턴 (이게 있으면 실패)
  const failPatterns = [
    /때문에\s*(진짜\s*)?(힘들|고민|스트레스|괴로)/,
    /진짜\s*(엄청\s*)?스트레스/,
    /한숨\s*(만\s*)?(나|푹)/,
    /점점\s*(더\s*)?심해/,
    /어느\s*날부터/,
    /^언제부터/,
    /자꾸\s*빠지는\s*거.*스트레스/,
    /속상(했|해)/,
  ];

  const hasFailPattern = failPatterns.some((p) => p.test(firstParagraph));
  if (hasFailPattern) {
    return {
      passed: false,
      reason: "도입부에 명확한 감정형 표현 감지 (문제 제기 톤)",
    };
  }

  const hasOpeningPattern = openingPatterns.some((p) =>
    p.test(firstParagraph)
  );
  const hasPositive = positiveKeywords.test(firstParagraph);

  if (hasOpeningPattern || hasPositive) {
    return { passed: true };
  }

  // 도입어도 긍정도 없지만 명확한 실패도 아님 → 통과 (오판 방지)
  return { passed: true };
}

/**
 * 감정 선공형 검증.
 * 기본적으로 거의 모든 글을 통과시킴 (기존 감정형 회귀 테스트 이미 통과).
 * 명확히 결론형으로 시작한 경우만 실패 처리.
 */
function validateEmpathyFirst(
  firstParagraph: string
): NarrativeValidationResult {
  // 명확한 결론형 도입 패턴 (이게 있으면 감정형으로는 실패)
  const conclusionOpeningPatterns = [
    /^지금은\s.*\s(거의\s*)?(없|괜찮|편안|여유|안\s*신경|걱정\s*없)/,
    /^이제는\s.*\s(거의\s*)?(없|괜찮|편안|해결|걱정\s*없)/,
  ];

  const hasConclusionOpening = conclusionOpeningPatterns.some((p) =>
    p.test(firstParagraph)
  );
  if (hasConclusionOpening) {
    return {
      passed: false,
      reason: "도입부가 결론형 패턴으로 시작함 (감정형에 부적합)",
    };
  }

  return { passed: true };
}
