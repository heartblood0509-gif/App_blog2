// 자막 조각 분할 — 백엔드 core/subtitle_utils.py 의 natural_split 를 그대로 포팅.
// 화면·소리 단계에서 각 줄의 "기본 끊김"을 제안하고, 미리보기 자막을 그린다.
// 최종 영상은 사용자가 확정한 조각을 그대로 박으므로(materialize), 이 결과가 곧 미리보기 = 결과물.
// ⚠️ 백엔드 natural_split 과 동작이 어긋나면 "미리보기 ≠ 자동 분할 폴백"이 되므로,
//    로직을 고칠 땐 파이썬 원본과 유닛 테스트(subtitle-split.test.ts)를 함께 맞출 것.

export const MAX_DISPLAY = 12; // 한 조각 최대 표시 폭(구두점 제외). 9:16 좁은 화면 기준.

const PUNCT_RE = /[?,!.~…·'"“”]/g;

/** 구두점을 제외한 '눈에 보이는' 길이. */
export function displayLen(text: string): number {
  return text.replace(PUNCT_RE, "").length;
}

// 자막에는 마침표를 넣지 않는다(동영상 자막 관례). 상단 대본 원문은 그대로 두고,
// 화면에 그려지는 자막 조각에서만 마침표를 뺀다. 소수점(숫자.숫자, 예: "3.5")은 보존.
// ⚠️ 백엔드 subtitle_utils.py 의 strip_subtitle_periods 와 규칙이 동일해야 함(미리보기=최종 영상).
const SUB_PERIOD_RE = /(?<!\d)\.|\.(?!\d)/g;

/** 자막 표시용: 마침표 제거(소수점은 보존). 원문 텍스트·TTS 타이밍에는 영향 없음. */
export function stripSubtitlePeriods(text: string): string {
  return text.replace(SUB_PERIOD_RE, "");
}

/** 한 줄 텍스트 → 기본 자막 조각들(쉼표 → 균형 어절 → 탐욕 어절). */
export function naturalSplit(text: string): string[] {
  if (displayLen(text) <= MAX_DISPLAY) return [text];

  const commaIdx = text.indexOf(",");
  if (commaIdx > 0) {
    const p1 = text.slice(0, commaIdx + 1).trim();
    const p2 = text.slice(commaIdx + 1).trim();
    if (p2) return [...naturalSplit(p1), ...naturalSplit(p2)];
  }

  const words = text.split(" ");
  if (words.length <= 1) return [text];

  let best: [string, string] | null = null;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const p1 = words.slice(0, i).join(" ");
    const p2 = words.slice(i).join(" ");
    const l1 = displayLen(p1);
    const l2 = displayLen(p2);
    if (l1 <= MAX_DISPLAY && l2 <= MAX_DISPLAY) {
      const score = Math.abs(l1 - l2);
      if (score < bestScore) {
        bestScore = score;
        best = [p1, p2];
      }
    }
  }
  if (best) return [best[0], best[1]];

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (displayLen(test) <= MAX_DISPLAY) {
      current = test;
    } else {
      if (current) chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 줄의 자막 조각: 사용자 확정값이 있으면 그대로, 없으면 기본 분할. */
export function chunksForLine(
  text: string,
  override: string[] | null | undefined,
): string[] {
  if (override && override.length > 0) {
    const cleaned = override.filter((c) => c && c.trim());
    if (cleaned.length > 0) return cleaned;
  }
  const t = text.trim();
  if (!t) return [];
  return naturalSplit(t);
}

/** 어절 사이 클릭으로 끊음/합침을 토글하기 위한 원자 단위(공백 기준 어절). */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** 현재 조각들 → 각 어절이 몇 번째 조각에 속하는지(어절 인덱스 → 조각 인덱스).
 * 조각을 공백으로 나눈 어절 수의 누적으로 매핑한다. */
export function breakSetFromChunks(chunks: string[]): Set<number> {
  // 조각 경계(= 끊김) 뒤에 오는 어절 인덱스 집합. 예: [["a b"],["c"]] → {2}
  const breaks = new Set<number>();
  let acc = 0;
  for (let i = 0; i < chunks.length - 1; i++) {
    acc += wordsOf(chunks[i]).length;
    breaks.add(acc);
  }
  return breaks;
}

/** 어절 목록 + 끊김 위치(어절 인덱스 집합) → 조각 문자열들. */
export function chunksFromBreaks(words: string[], breaks: Set<number>): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && breaks.has(i)) {
      out.push(cur.join(" "));
      cur = [];
    }
    cur.push(words[i]);
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/** 12자(표시 폭) 초과 조각이 하나라도 있으면 true(영상 만들기 차단 판정). */
export function hasOverflowChunk(chunks: string[]): boolean {
  return chunks.some((c) => displayLen(c) > MAX_DISPLAY);
}

// ── 어절 타임스탬프(word_times) 기반 자막 조각 경계 ─────────────
// 백엔드 core/subtitle_utils.py 의 word_times_match / _word_chunk_segments 와 규칙 동일.
// (미리보기=최종영상 보장. 로직 변경 시 양쪽 + 테스트 함께 맞출 것.)

export interface WordTime {
  text: string;
  start: number; // 줄 오디오 기준 초
  end: number;
}

function normJoined(s: string): string {
  return s.replace(/\s+/g, "").replace(/\.+$/, "");
}

/** chunks(어절 묶음)와 wordTimes가 정합하는지: 문자열(공백·끝마침표 제거) 일치 + start 단조증가.
 * 어절 수 일치는 요구하지 않는다 — 자막 전용 띄어쓰기(발화 한 어절이 자막에선 여러 어절)를 허용. */
export function wordTimesMatch(
  chunks: string[],
  wordTimes: WordTime[] | null | undefined,
): boolean {
  if (!wordTimes || !Array.isArray(wordTimes) || wordTimes.length === 0) return false;
  if (normJoined(chunks.join("")) !== normJoined(wordTimes.map((w) => w.text).join("")))
    return false;
  const starts = wordTimes.map((w) => w.start);
  for (let i = 0; i < starts.length - 1; i++) {
    if (starts[i] > starts[i + 1] + 1e-6) return false;
  }
  return true;
}

const stripSpace = (s: string) => s.replace(/\s+/g, "");

/** 조각별 '끝 시각'(줄 시작 기준 초) 배열. 재생 훅의 chunkBoundaries 와 같은 형태
 * (길이 = chunks.length, 마지막 = durationSec). 정합 안 되면 null → 호출부가 비례 폴백.
 *
 * 경계는 공백을 뺀 글자 누적 위치로 발화 어절에 매핑한다:
 *  · 어절 시작에 떨어지면 그 어절의 start (pause 동안 이전 자막 유지 — 기존 규칙 그대로)
 *  · 어절 '안'에 떨어지면(자막 전용 띄어쓰기로 발화 어절을 쪼갠 경우) 글자 비율로 보간 */
export function chunkBoundariesFromWordTimes(
  chunks: string[],
  wordTimes: WordTime[] | null | undefined,
  durationSec: number,
): number[] | null {
  if (!wordTimesMatch(chunks, wordTimes)) return null;
  const wt = wordTimes as WordTime[];
  // 발화 어절별 (공백 제거) 글자 길이와 시작 위치 누적.
  const lens = wt.map((w) => stripSpace(w.text).length);
  const startChar: number[] = [];
  {
    let a = 0;
    for (const L of lens) {
      startChar.push(a);
      a += L;
    }
  }
  const bounds: number[] = [];
  let p = 0; // 다음 조각 첫 글자의 누적 위치(공백 제거 기준)
  for (let i = 0; i < chunks.length; i++) {
    p += stripSpace(chunks[i]).length;
    const prev = i > 0 ? bounds[i - 1] : 0;
    let raw: number;
    if (i === chunks.length - 1) {
      raw = durationSec;
    } else {
      let j = 0;
      while (j + 1 < startChar.length && startChar[j + 1] <= p) j++;
      if (p === startChar[j] || lens[j] <= 0) {
        raw = wt[j].start;
      } else {
        const frac = (p - startChar[j]) / lens[j];
        raw = wt[j].start + (wt[j].end - wt[j].start) * frac;
      }
    }
    bounds.push(Math.min(Math.max(raw, prev), durationSec)); // 단조 + [0,duration] 클램프
  }
  return bounds;
}

// ── 자막 전용 띄어쓰기(발화 어절 안 끊기) 간격 분류 ─────────────
/** 자막 어절 사이 간격 분류. 반환 배열 길이 = displayWords.length, 인덱스 g = "어절 g-1과 g 사이 간격"
 * ([0]은 미사용). 발화(대본) 어절 '안'에서 생긴 간격(자막 전용 띄어쓰기)이면 "split",
 * 원래 대본에 있던 공백이면 "natural". 글자 단위로 정렬이 안 되면 null(호출부가 전부 natural 취급). */
export function gapKinds(
  ttsWords: string[],
  displayWords: string[],
): ("natural" | "split")[] | null {
  const kinds: ("natural" | "split")[] = new Array(displayWords.length).fill("natural");
  let j = 0;
  let acc = "";
  for (let k = 0; k < displayWords.length; k++) {
    if (j >= ttsWords.length) return null;
    acc += displayWords[k];
    if (acc === ttsWords[j]) {
      j++;
      acc = "";
    } else if (ttsWords[j].startsWith(acc)) {
      if (k + 1 < displayWords.length) kinds[k + 1] = "split";
    } else {
      return null;
    }
  }
  if (j !== ttsWords.length || acc) return null;
  return kinds;
}
