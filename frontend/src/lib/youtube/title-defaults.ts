// 제목 스타일 "이 기기 마지막 사용값" 자동 기억 + "저장한 색" 팔레트(로컬).
//
// 정책(자동 기억 우선): 새 영상은 이 기기의 마지막 스타일(폰트·굵기·크기·색)로 시작한다.
// 별도 "기본값 pin" 은 없다. 저장한 색은 색 선택 팝오버에서 언제든 재선택할 수 있는 커스텀
// 색 목록으로, M2 에서 여러 기기 동기화 대상이 된다(로컬은 그 캐시 겸 오프라인 폴백).
//
// SSR 안전: 모든 함수가 typeof window 가드를 거친다. (패턴: draft-storage.ts)

import { TITLE_FONT_SIZE_MIN, TITLE_FONT_SIZE_MAX } from "./fonts";
import { normalizeHex } from "./title-colors";

export interface TitleStyle {
  font: string;
  weight: string;
  size: number;
  color1: string;
  color2: string;
}

const STYLE_KEY = "blogpick-yt-title-style";
const COLORS_KEY = "blogpick-yt-saved-colors";

// ── 마지막 사용 스타일 ────────────────────────────────────────

/** 저장된 마지막 스타일을 검증해 부분 반환. 없거나 손상되면 {} (호출부 기본값 유지). */
export function loadLastUsed(): Partial<TitleStyle> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Record<keyof TitleStyle, unknown>>;
    const out: Partial<TitleStyle> = {};
    if (typeof p.font === "string") out.font = p.font;
    if (typeof p.weight === "string") out.weight = p.weight;
    if (typeof p.size === "number" && Number.isFinite(p.size)) {
      out.size = Math.max(TITLE_FONT_SIZE_MIN, Math.min(TITLE_FONT_SIZE_MAX, Math.round(p.size)));
    }
    if (typeof p.color1 === "string") {
      const c = normalizeHex(p.color1);
      if (c) out.color1 = c;
    }
    if (typeof p.color2 === "string") {
      const c = normalizeHex(p.color2);
      if (c) out.color2 = c;
    }
    return out;
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStyle: TitleStyle | null = null;

/** 마지막 스타일을 디바운스 저장(스타일 변경이 잦은 슬라이더/색 선택 대비). */
export function saveLastUsed(style: TitleStyle): void {
  if (typeof window === "undefined") return;
  pendingStyle = style;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!pendingStyle) return;
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(pendingStyle));
    } catch {
      // quota 등 무시 — 자동 기억은 실패해도 기능에 지장 없음
    }
  }, 400);
}

// ── 저장한 색 팔레트 (로컬) ──────────────────────────────────
// useSyncExternalStore 로 팝오버가 실시간 반영. 안정 스냅샷 참조 유지.

const listeners = new Set<() => void>();
let cachedColors: string[] | null = null;
const EMPTY: string[] = [];

function readColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COLORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 저장 시점에 이미 정규화하지만, 손상 대비 재정규화 + dedupe.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string") continue;
      const c = normalizeHex(v);
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeColors(colors: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
  } catch {
    // 무시
  }
  cachedColors = null;
  for (const l of listeners) l();
}

export function subscribeSavedColors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 안정 참조 스냅샷(useSyncExternalStore 요구). */
export function getSavedColorsSnapshot(): string[] {
  if (cachedColors === null) cachedColors = readColors();
  return cachedColors;
}

/** SSR 스냅샷 — 서버에선 항상 빈 배열(동일 참조). */
export function getSavedColorsServerSnapshot(): string[] {
  return EMPTY;
}

/** 색 저장(중복이면 맨 앞으로 승격). 정규화 실패 시 무시. 최대 24개 유지. */
export function addSavedColor(hex: string): void {
  const c = normalizeHex(hex);
  if (!c) return;
  const cur = readColors().filter((x) => x !== c);
  writeColors([c, ...cur].slice(0, 24));
}

export function removeSavedColor(hex: string): void {
  const c = normalizeHex(hex);
  if (!c) return;
  writeColors(readColors().filter((x) => x !== c));
}
