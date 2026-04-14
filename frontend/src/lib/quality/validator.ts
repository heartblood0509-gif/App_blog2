import type { QualityResult } from "@/types";
import { checkForbiddenWords } from "./forbidden-words";
import { detectAdExpressions } from "./ad-detector";

/**
 * 5계층 품질 검증 시스템
 * 1. 네이버 금칙어
 * 2. 키워드 밀도
 * 3. 광고성 표현 탐지
 * 4. 글자수 범위
 * 5. 구조 검증 (소제목, 해시태그)
 */

export function validateContent(
  text: string,
  keyword: string,
  charRange: { min: number; max: number }
): QualityResult {
  // 글자수 계산
  const charCount = text.length;
  const charCountWithoutSpaces = text.replace(/\s/g, "").length;

  // 키워드 밀도 계산
  const keywordRegex = new RegExp(keyword, "gi");
  const keywordMatches = text.match(keywordRegex);
  const keywordCount = keywordMatches ? keywordMatches.length : 0;
  const keywordDensity =
    charCountWithoutSpaces > 0
      ? (keywordCount * keyword.length) / charCountWithoutSpaces * 100
      : 0;

  // 금칙어 검사
  const forbiddenWords = checkForbiddenWords(text);

  // 광고성 표현 검사
  const adExpressions = detectAdExpressions(text);

  // 소제목 카운트 (> 형식)
  const subheadingRegex = /^>/gm;
  const subheadingMatches = text.match(subheadingRegex);
  const subheadingCount = subheadingMatches ? subheadingMatches.length : 0;

  // 해시태그 카운트
  const hashtagRegex = /#[가-힣a-zA-Z0-9_]+/g;
  const hashtagMatches = text.match(hashtagRegex);
  const hashtagCount = hashtagMatches ? hashtagMatches.length : 0;

  // 종합 판정 (글자수는 max의 50% 여유 허용 — AI 생성 특성상 정확한 글자수 제어가 어려움)
  const isPass =
    charCount >= charRange.min &&
    charCount <= charRange.max * 1.5 &&
    keywordCount >= 4 &&
    keywordCount <= 7 &&
    forbiddenWords.length === 0 &&
    adExpressions.length === 0 &&
    subheadingCount >= 3 &&
    hashtagCount >= 8;

  return {
    charCount,
    charCountWithoutSpaces,
    keywordCount,
    keywordDensity: Math.round(keywordDensity * 100) / 100,
    forbiddenWords,
    adExpressions,
    subheadingCount,
    hashtagCount,
    isPass,
  };
}
