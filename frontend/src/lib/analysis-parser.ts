/**
 * 분석 결과 마크다운에서 `<!-- FLOW: [...] -->` 메타 코멘트를 분리한다.
 *
 * - flow JSON 파싱이 실패하면 flow=[]로 폴백 (글 생성에 영향 없음).
 * - 코멘트 자체는 분석 본문에서 제거해서 프롬프트 주입을 깨끗하게 유지.
 */
export function extractFlowFromAnalysis(rawAnalysis: string): {
  analysis: string;
  flow: string[];
} {
  const FLOW_COMMENT_RE = /<!--\s*FLOW:\s*(\[[\s\S]*?\])\s*-->/i;
  const match = rawAnalysis.match(FLOW_COMMENT_RE);

  if (!match) {
    return { analysis: rawAnalysis.trim(), flow: [] };
  }

  let flow: string[] = [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      flow = parsed;
    }
  } catch {
    flow = [];
  }

  const analysis = rawAnalysis.replace(FLOW_COMMENT_RE, "").trim();
  return { analysis, flow };
}
