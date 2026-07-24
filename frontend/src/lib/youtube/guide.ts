// 쇼츠 자막·제목이 "화면 안전선"을 벗어나는지 실제 픽셀 폭으로 판정 + 프리뷰 가이드 좌표.
//
// 왜 글자 수(12자)가 아니라 픽셀인가: 같은 12자라도 글씨 크기를 줄이면 화면에 들어가고,
// 자막을 좌우로 끌면(dx) 넘치는 위치가 달라진다. 글자 수는 이를 반영 못 해 "화면엔 다 들어가는데
// 막히는" 오탐/오차단을 낳는다. 폰트 4종은 전부 앱 번들(제목=자막 동일 TTF)이라 canvas measureText
// 폭이 최종 렌더(FFmpeg drawtext)와 사실상 일치하고 OS 와 무관하게 결정적이다.
//
// 좌표계는 최종 렌더 기준(1080×1920). 자막·제목은 가로 중앙(x=540) + dx 오프셋으로 놓인다.
// 백엔드 짝: core/subtitle_guide.py (PIL getlength 로 같은 판정, confirm 백스톱).

import { displayLen, stripSubtitlePeriods } from "./subtitle-split";

export const RENDER_W = 1080;
export const RENDER_H = 1920;
const CENTER_X = RENDER_W / 2; // 540 — 자막·제목 가로 중앙

// 가이드1(안전선): 휴대폰 기종마다 상하좌우가 잘리므로 최소 안전 영역. PNG 실측 = 사방 100px 여백.
// 가로 폭 판정(차단)의 유일한 기준. (세로는 표시만 — 사용자 결정: 가로만 차단.)
export const GUIDE_SAFE = { left: 100, top: 100, right: 980, bottom: 1820 } as const;

// 가이드2(유튜브 UI 가 덮는 영역): 참고용 표시 전용(차단 아님). 렌더 좌표. PNG 블록 실측.
export const GUIDE_UI_BLOCKS = [
  { left: 38, top: 39, right: 1041, bottom: 156 }, // 상단 배너
  { left: 38, top: 1504, right: 822, bottom: 1881 }, // 하단 좌측(제목·구독·설명)
  { left: 861, top: 797, right: 1041, bottom: 1881 }, // 우측 버튼 컬럼(좋아요·댓글·공유)
] as const;

/** 자막 테두리(외곽선) 두께(px) — 백엔드 sub_border(video_assembler.py) 와 동일 공식.
 *  글자 폭 양옆에 각각 붙으므로 넘침 판정 시 2배 가산. */
export function subtitleStrokePx(sizePx: number): number {
  return Math.max(1, Math.round((3 * sizePx) / 55));
}

/** 중앙 정렬 + dx 오프셋된 가로 폭(렌더 px)이 안전선 좌/우를 벗어나는지(가로만). */
export function centeredWidthOverflowsSafe(widthRenderPx: number, dxRenderPx: number): boolean {
  const half = widthRenderPx / 2;
  const left = CENTER_X + dxRenderPx - half;
  const right = CENTER_X + dxRenderPx + half;
  return left < GUIDE_SAFE.left || right > GUIDE_SAFE.right;
}

// ── 텍스트 폭 측정 ────────────────────────────────────────────────
// measure(text, sizePx, fontFamily, fontWeight) → 렌더 px 기준 가로 폭.
// canvas 는 font-size 에 선형 비례하므로, 렌더 sizePx 그대로 재면 곧 렌더 px 폭이다(프레임 환산 불필요).
export type WidthMeasurer = (
  text: string,
  sizePx: number,
  fontFamily: string,
  fontWeight: number,
) => number;

let _ctx: CanvasRenderingContext2D | null = null;
let _ctxTried = false;

function canvasCtx(): CanvasRenderingContext2D | null {
  if (_ctxTried) return _ctx;
  _ctxTried = true;
  if (typeof document !== "undefined") {
    _ctx = document.createElement("canvas").getContext("2d");
  }
  return _ctx;
}

/** 기본 측정기 — 번들 폰트로 canvas 실측. 측정 불가 환경(SSR/테스트)에선 글자수×크기 보수 폴백. */
export const canvasMeasurer: WidthMeasurer = (text, sizePx, fontFamily, fontWeight) => {
  const ctx = canvasCtx();
  if (!ctx) return displayLen(text) * sizePx; // 한글은 대략 1em 폭 — 약간 보수적
  ctx.font = `${fontWeight} ${sizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
};

export interface SubtitleStyle {
  sizePx: number; // 렌더 px(1080 좌표)
  dx: number; // 렌더 px, 가로 중앙 오프셋
  fontFamily: string; // titleFontStyle().fontFamily (예: "'TF-Pretendard'")
  fontWeight: number; // titleFontStyle().fontWeight
}

/** 조각들을 화면 줄(각 조각의 "\n" = 화면 줄바꿈)로 펼친다.
 *  parseSubtitleChunks 의 화면 줄 구성과 순서·필터가 동일해야 lineOverflow 인덱스가 맞물린다. */
export function subtitleDisplayLines(chunks: string[]): string[] {
  return chunks
    .flatMap((c) => c.split("\n"))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 화면 줄 하나가 안전선을 벗어나는지(마침표 제외·NFC·테두리 가산). */
export function displayLineOverflowsGuide(
  text: string,
  style: SubtitleStyle,
  measure: WidthMeasurer = canvasMeasurer,
): boolean {
  const clean = stripSubtitlePeriods(text).normalize("NFC").trim();
  if (!clean) return false;
  const w = measure(clean, style.sizePx, style.fontFamily, style.fontWeight);
  return centeredWidthOverflowsSafe(w + 2 * subtitleStrokePx(style.sizePx), style.dx);
}

/** 조각의 화면 줄별 넘침 여부(subtitleDisplayLines 순서 = parseSubtitleChunks 의 화면 줄 인덱스). */
export function overflowingDisplayLines(
  chunks: string[],
  style: SubtitleStyle,
  measure?: WidthMeasurer,
): boolean[] {
  return subtitleDisplayLines(chunks).map((ln) => displayLineOverflowsGuide(ln, style, measure));
}

/** 이 줄(조각들 전체) 중 하나라도 안전선을 벗어나면 true — 영상 만들기 차단 판정. */
export function anyChunkOverflowsGuide(
  chunks: string[],
  style: SubtitleStyle,
  measure?: WidthMeasurer,
): boolean {
  return subtitleDisplayLines(chunks).some((ln) =>
    displayLineOverflowsGuide(ln, style, measure),
  );
}
