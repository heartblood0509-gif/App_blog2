// 자막 스타일 "이 기기 마지막 사용값" 자동 기억(로컬). 제목의 title-defaults.ts 와 같은 정책 —
// 새 영상은 이 기기의 마지막 자막 스타일(폰트·굵기·크기·색)로 시작한다. 위치(dx/y)는 작업마다
// 화면 구성에 따라 달라지므로 기억하지 않고 매번 기본값에서 시작한다.
//
// SSR 안전: 모든 함수가 typeof window 가드를 거친다(패턴: title-defaults.ts).

import { SUBTITLE_FONT_SIZE_MIN, SUBTITLE_FONT_SIZE_MAX } from "./fonts";
import { normalizeHex } from "./title-colors";

export interface SubtitleStyle {
  font: string; // ""=기본 자막폰트
  weight: string;
  size: number;
  color: string;
}

const STYLE_KEY = "blogpick-yt-subtitle-style";

/** 저장된 마지막 자막 스타일을 검증해 부분 반환. 없거나 손상되면 {} (호출부 기본값 유지). */
export function loadLastSubtitle(): Partial<SubtitleStyle> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Record<keyof SubtitleStyle, unknown>>;
    const out: Partial<SubtitleStyle> = {};
    // 빈 폰트("")는 무시 — 이전 '기본' 옵션의 잔여값이 새 기본(프리텐다드)을 덮지 않게.
    if (typeof p.font === "string" && p.font) out.font = p.font;
    if (typeof p.weight === "string" && p.weight) out.weight = p.weight;
    if (typeof p.size === "number" && Number.isFinite(p.size)) {
      out.size = Math.max(SUBTITLE_FONT_SIZE_MIN, Math.min(SUBTITLE_FONT_SIZE_MAX, Math.round(p.size)));
    }
    if (typeof p.color === "string") {
      const c = normalizeHex(p.color);
      if (c) out.color = c;
    }
    return out;
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: SubtitleStyle | null = null;

/** 마지막 자막 스타일을 디바운스 저장(슬라이더/색 선택이 잦으므로). */
export function saveLastSubtitle(style: SubtitleStyle): void {
  if (typeof window === "undefined") return;
  pending = style;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!pending) return;
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(pending));
    } catch {
      // quota 등 무시 — 자동 기억은 실패해도 기능에 지장 없음
    }
  }, 400);
}
