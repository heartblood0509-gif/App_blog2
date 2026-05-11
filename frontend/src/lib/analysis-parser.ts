/**
 * 분석 결과 마크다운에서 메타 코멘트를 분리한다.
 *
 * - `<!-- FLOW: [...] -->` 단계 시각화용 (카드)
 * - `<!-- EXCERPTS: [...] -->` 톤 본보기 ("레퍼런스 그대로" 모드 주입용)
 *
 * 파싱 실패 시 빈 배열로 폴백 (글 생성 영향 없음).
 * 코멘트는 분석 본문에서 제거해서 프롬프트 주입을 깨끗하게 유지.
 */

const FLOW_COMMENT_RE = /<!--\s*FLOW:\s*(\[[\s\S]*?\])\s*-->/i;
const EXCERPTS_COMMENT_RE = /<!--\s*EXCERPTS:\s*(\[[\s\S]*?\])\s*-->/i;

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

export function extractFlowFromAnalysis(rawAnalysis: string): {
  analysis: string;
  flow: string[];
  excerpts: string[];
} {
  const flowMatch = rawAnalysis.match(FLOW_COMMENT_RE);
  const excerptsMatch = rawAnalysis.match(EXCERPTS_COMMENT_RE);

  const flow = flowMatch ? parseStringArray(flowMatch[1]) : [];
  const excerpts = excerptsMatch ? parseStringArray(excerptsMatch[1]) : [];

  const analysis = rawAnalysis
    .replace(FLOW_COMMENT_RE, "")
    .replace(EXCERPTS_COMMENT_RE, "")
    .trim();

  return { analysis, flow, excerpts };
}

/**
 * 분석 마크다운 본문의 "## 흐름 한 줄" 섹션에서 단계 배열을 추출.
 *
 * - 예) "문제 제기 → 위험 경고 → 전문가 선언" → ["문제 제기", "위험 경고", "전문가 선언"]
 * - FLOW HTML 코멘트가 떨어져 나간 후의 마크다운에서도 작동 (보관함 카드 fallback용)
 * - 매칭 실패 시 빈 배열
 */
export function extractFlowFromMarkdownBody(rawAnalysis: string): string[] {
  const match = rawAnalysis.match(/##\s*흐름\s*한\s*줄\s*\n+([^\n]+)/);
  if (!match) return [];
  return match[1]
    .split(/→|➔|➡|->/)
    .map((s) => s.trim())
    .filter(Boolean);
}
