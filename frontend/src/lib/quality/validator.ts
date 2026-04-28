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
 *
 * `[이미지: …]` 마커는 실제 발행 시 이미지로 치환되므로
 * 글자수/키워드/금칙어/광고성 계산에서 제외한다.
 */

const IMAGE_MARKER_RE = /\[이미지:\s*[^\]]+\]/g;

function stripImageMarkers(text: string): string {
  return text.replace(IMAGE_MARKER_RE, "");
}

export function validateContent(
  text: string,
  keyword: string,
  charRange: { min: number; max: number }
): QualityResult {
  // 이미지 마커 제외한 본문으로 품질 지표 계산
  const textForMetrics = stripImageMarkers(text);

  // 이미지 마커 카운트 (원본에서)
  const imageMarkerMatches = text.match(IMAGE_MARKER_RE);
  const imageMarkerCount = imageMarkerMatches ? imageMarkerMatches.length : 0;

  // 글자수 계산 (마커 제외)
  const charCount = textForMetrics.length;
  const charCountWithoutSpaces = textForMetrics.replace(/\s/g, "").length;

  // 키워드 밀도 계산
  const keywordRegex = new RegExp(keyword, "gi");
  const keywordMatches = textForMetrics.match(keywordRegex);
  const keywordCount = keywordMatches ? keywordMatches.length : 0;
  const keywordDensity =
    charCountWithoutSpaces > 0
      ? (keywordCount * keyword.length) / charCountWithoutSpaces * 100
      : 0;

  // 금칙어 검사 (마커 제외)
  const forbiddenWords = checkForbiddenWords(textForMetrics);

  // 광고성 표현 검사 (마커 제외)
  const adExpressions = detectAdExpressions(textForMetrics);

  // 소제목 카운트 (> 형식) — 원본 기준(마커 제거해도 동일)
  const subheadingRegex = /^#{2,3}(\{[^}]+\})?\s+/gm;
  const subheadingMatches = text.match(subheadingRegex);
  const subheadingCount = subheadingMatches ? subheadingMatches.length : 0;

  // 해시태그 카운트
  const hashtagRegex = /#[가-힣a-zA-Z0-9_]+/g;
  const hashtagMatches = textForMetrics.match(hashtagRegex);
  const hashtagCount = hashtagMatches ? hashtagMatches.length : 0;

  // 미통과 사유 수집 (공백 포함 글자수 기준)
  const failReasons: string[] = [];

  if (charCount < charRange.min) {
    failReasons.push(`글자수 부족: ${charCount.toLocaleString()}자 (최소 ${charRange.min.toLocaleString()}자)`);
  }
  if (charCount > charRange.max + 500) {
    failReasons.push(`글자수 초과: ${charCount.toLocaleString()}자 (최대 ${(charRange.max + 500).toLocaleString()}자)`);
  }
  if (keywordCount < 4) {
    failReasons.push(`키워드 부족: ${keywordCount}회 (최소 4회)`);
  }
  if (keywordCount > 10) {
    failReasons.push(`키워드 과다: ${keywordCount}회 (최대 10회)`);
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

  // 문장부호 검출 — 마침표/쉼표/느낌표/물음표/따옴표 (한국어 전각 따옴표 포함)
  // 해시태그 라인과 이미지 마커는 이미 textForMetrics 에서 제외됨
  const PUNCT_RE = /[.,!?"'"""‘’]/g;
  const punctMatches = textForMetrics.match(PUNCT_RE);
  const punctCount = punctMatches ? punctMatches.length : 0;
  if (punctCount > 0) {
    failReasons.push(`문장부호 검출: ${punctCount}개 (마침표 쉼표 느낌표 물음표 따옴표 전부 제거 필요)`);
  }

  // 긴 문단 검출 — 6줄 이상 연속된 비공백 본문 줄 (소제목은 break 포인트)
  const metricLines = textForMetrics.split("\n");
  let longParagraphCount = 0;
  let runLen = 0;
  for (const line of metricLines) {
    const t = line.trim();
    if (t === "") { runLen = 0; continue; }
    if (/^#{2,3}/.test(t)) { runLen = 0; continue; }
    runLen++;
    if (runLen === 6) longParagraphCount++;
  }
  if (longParagraphCount > 0) {
    failReasons.push(`긴 문단 ${longParagraphCount}개 (5줄 이상 연속 금지, 2~4줄로 쪼갤 것)`);
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
    imageMarkerCount,
    isPass,
    failReasons,
  };
}
