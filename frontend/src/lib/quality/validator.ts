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

  // 미통과 사유 수집 (공백 제외 글자수 기준)
  const failReasons: string[] = [];

  if (charCountWithoutSpaces < charRange.min) {
    failReasons.push(`글자수 부족: ${charCountWithoutSpaces.toLocaleString()}자 (최소 ${charRange.min.toLocaleString()}자)`);
  }
  if (charCountWithoutSpaces > charRange.max + 200) {
    failReasons.push(`글자수 초과: ${charCountWithoutSpaces.toLocaleString()}자 (최대 ${(charRange.max + 200).toLocaleString()}자)`);
  }
  if (keywordCount < 4) {
    failReasons.push(`키워드 부족: ${keywordCount}회 (최소 4회)`);
  }
  if (keywordCount > 7) {
    failReasons.push(`키워드 과다: ${keywordCount}회 (최대 7회)`);
  }
  if (forbiddenWords.length > 0) {
    failReasons.push(`금지어 검출: ${forbiddenWords.length}건`);
  }
  if (adExpressions.length > 0) {
    failReasons.push(`광고성 표현: ${adExpressions.length}건`);
  }
  if (subheadingCount < 3) {
    failReasons.push(`소제목 부족: ${subheadingCount}개 (최소 3개)`);
  }
  if (hashtagCount < 8) {
    failReasons.push(`해시태그 부족: ${hashtagCount}개 (최소 8개)`);
  }

  const isPass = failReasons.length === 0;

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
    failReasons,
  };
}
