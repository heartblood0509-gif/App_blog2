// 쇼츠 제목 색(HEX) — 기본값·프리셋·정규화. 백엔드 짝: youtube-backend/core/colors.py.
// 색값은 최종적으로 ffmpeg drawtext fontcolor 에 박히므로, UI/상태/전송 전 구간에서
// "#RRGGBB(대문자)" 형태만 통과시킨다(백엔드에서 한 번 더 검증 — 2중 방어).

// 제목 기본색: 윗줄 흰색 / 아랫줄 톤다운 노란색. core/colors.py 의 값과 일치해야 한다.
export const DEFAULT_TITLE_COLOR1 = "#FFFFFF";
export const DEFAULT_TITLE_COLOR2 = "#E8D44D";

// 색 선택 팝오버 프리셋(윗줄/아랫줄 공용). 흰색·검정 + 지정 6색.
export const TITLE_COLOR_PRESETS: string[] = [
  "#FFFFFF", // 흰색
  "#000000", // 검정
  "#90F4FE", // 하늘
  "#02F5C9", // 민트
  "#E96558", // 코랄
  "#19F277", // 초록
  "#FF2E2F", // 빨강
  "#E8D44D", // 노랑(기본 아랫줄)
];

/** 6자리 HEX(#유무 무관)면 '#RRGGBB'(대문자), 아니면 null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9A-Fa-f]{6})$/.exec(input.trim());
  return m ? "#" + m[1].toUpperCase() : null;
}

/** input 이 유효 HEX 면 정규화값, 아니면 fallback(그대로). */
export function normalizeHexOr(input: string | null | undefined, fallback: string): string {
  if (typeof input !== "string") return fallback;
  return normalizeHex(input) ?? fallback;
}

/** 배경 HEX 위에 얹을 아이콘/글자 색(검정/흰색) — 상대 휘도 기준. */
export function contrastText(hex: string): "#000000" | "#FFFFFF" {
  const c = normalizeHex(hex);
  if (!c) return "#000000";
  const r = parseInt(c.slice(1, 3), 16) / 255;
  const g = parseInt(c.slice(3, 5), 16) / 255;
  const b = parseInt(c.slice(5, 7), 16) / 255;
  // 단순 상대 휘도(sRGB 근사) — 밝으면 검정, 어두우면 흰색.
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.6 ? "#000000" : "#FFFFFF";
}
