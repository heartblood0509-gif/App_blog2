/**
 * EXCERPTS(레퍼런스 본보기 문장 8개) → 어미·호흡 패턴 통계 요약.
 *
 * 핵심 의도: 원본 문장 자체는 LLM 프롬프트에 절대 노출하지 않고,
 * 통계 요약(어미 분포·길이·문장 유형 비율·시각 강조 패턴)만 전달해 표절 차단.
 *
 * - 정적 분석 (LLM 호출 없음, 결정적·빠름)
 * - tone-extractor.ts 의 정규식 로직과 보완 관계 (이쪽은 EXCERPTS 전용 더 세밀한 분포 산출)
 */

interface ExcerptStats {
  count: number;
  avgLength: number;
  endingDistribution: Array<{ pattern: string; count: number }>;
  sentenceTypes: { question: number; assertion: number; exclamation: number };
  visualEmphasis: string[];
}

const ENDING_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: "~합니다", regex: /합니다[.!?]?$/ },
  { key: "~입니다", regex: /입니다[.!?]?$/ },
  { key: "~죠/~죠?", regex: /죠[.!?]?$/ },
  { key: "~겠죠/~겠죠?", regex: /겠죠[.!?]?$/ },
  { key: "~습니까/~입니까", regex: /(습니까|입니까)[.!?]?$/ },
  { key: "~어요/~예요", regex: /(어요|예요|이에요|아요)[.!?]?$/ },
  { key: "~함/~음 (음슴체)", regex: /(함|됨|음|었음)[.!?]?$/ },
  { key: "~까요?", regex: /까요\?$/ },
  { key: "~네요", regex: /네요[.!?]?$/ },
  { key: "~군요", regex: /군요[.!?]?$/ },
];

function classifyEnding(sentence: string): string {
  const trimmed = sentence.trim();
  for (const { key, regex } of ENDING_PATTERNS) {
    if (regex.test(trimmed)) return key;
  }
  return "기타";
}

function classifySentenceType(sentence: string): "question" | "exclamation" | "assertion" {
  const trimmed = sentence.trim();
  if (/[?？]$/.test(trimmed) || /까요\??$/.test(trimmed)) return "question";
  if (/[!！]$/.test(trimmed)) return "exclamation";
  return "assertion";
}

function detectVisualEmphasis(sentences: string[]): string[] {
  const found = new Set<string>();
  const joined = sentences.join(" ");
  if (/[가-힣]\.[가-힣]\.[가-힣]/.test(joined)) {
    found.add("단어 사이 마침표 (예: 절.대.로, 비.양.심.)");
  }
  if (/[""].+?[""]|".+?"/.test(joined)) {
    found.add("큰따옴표 인용 강조");
  }
  if (/[가-힣]+~/.test(joined)) {
    found.add("물결 표시 늘이기 (예: 잘~)");
  }
  if (/!!/.test(joined)) {
    found.add("느낌표 연타");
  }
  if (/[가-힣]+\?\?/.test(joined)) {
    found.add("물음표 연타");
  }
  return Array.from(found);
}

export function analyzeExcerpts(excerpts: string[]): ExcerptStats {
  const cleaned = excerpts.map((s) => s.trim()).filter(Boolean);
  const count = cleaned.length;
  const avgLength = count > 0 ? Math.round(cleaned.reduce((a, s) => a + s.length, 0) / count) : 0;

  const endingMap = new Map<string, number>();
  const types = { question: 0, assertion: 0, exclamation: 0 };
  for (const s of cleaned) {
    const ending = classifyEnding(s);
    endingMap.set(ending, (endingMap.get(ending) ?? 0) + 1);
    types[classifySentenceType(s)]++;
  }
  const endingDistribution = Array.from(endingMap.entries())
    .map(([pattern, c]) => ({ pattern, count: c }))
    .sort((a, b) => b.count - a.count);

  return {
    count,
    avgLength,
    endingDistribution,
    sentenceTypes: types,
    visualEmphasis: detectVisualEmphasis(cleaned),
  };
}

/**
 * LLM 프롬프트 주입용 자연어 지시 생성. 원본 문장은 절대 포함하지 않는다.
 */
export function buildExcerptPatternRule(excerpts: string[]): string {
  const cleaned = excerpts.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";

  const stats = analyzeExcerpts(cleaned);
  const endingStr = stats.endingDistribution
    .map((d) => `${d.pattern} ${d.count}회`)
    .join(", ");
  const typeStr = `의문 ${stats.sentenceTypes.question}, 단언 ${stats.sentenceTypes.assertion}, 감탄 ${stats.sentenceTypes.exclamation}`;
  const emphasisStr =
    stats.visualEmphasis.length > 0
      ? stats.visualEmphasis.map((e) => `  · ${e}`).join("\n")
      : "  · (특이 사항 없음)";

  return `[레퍼런스 어미·호흡 패턴 — 이 통계 분포만 흡수, 원본 문장은 비공개]
- 본보기 문장 수: ${stats.count}개 (평균 ${stats.avgLength}자)
- 어미 분포: ${endingStr}
- 문장 유형: ${typeStr}
- 시각 강조 기법:
${emphasisStr}

위 분포를 새 글에서 자연스럽게 재현하세요. 본보기 원문은 시스템에서 의도적으로 숨겨두었으므로, 표현·단어·예시는 본문 도메인에 맞게 처음부터 새로 작성하세요.`;
}

/**
 * 보관함 레코드용 1줄 요약 — UI 표시 및 분석 카드에 노출.
 * LLM 주입용이 아니라 사람 가독용.
 */
export function buildExcerptPatternSummary(excerpts: string[]): string {
  const cleaned = excerpts.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";

  const stats = analyzeExcerpts(cleaned);
  const top = stats.endingDistribution.slice(0, 3).map((d) => d.pattern).join("·");
  const emphasis = stats.visualEmphasis.length > 0 ? `, ${stats.visualEmphasis[0]}` : "";
  return `평균 ${stats.avgLength}자, 어미 ${top} 위주${emphasis}`;
}
