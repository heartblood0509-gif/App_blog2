// 제목 스타일 "이 기기 마지막 사용값" 자동 기억 + "저장한 색" 팔레트(로컬).
//
// 정책(자동 기억 우선): 새 영상은 이 기기의 마지막 스타일(폰트·굵기·크기·색)로 시작한다.
// 별도 "기본값 pin" 은 없다. 저장한 색은 색 선택 팝오버에서 언제든 재선택할 수 있는 커스텀
// 색 목록으로, M2 에서 여러 기기 동기화 대상이 된다(로컬은 그 캐시 겸 오프라인 폴백).
//
// SSR 안전: 모든 함수가 typeof window 가드를 거친다. (패턴: draft-storage.ts)

import {
  TITLE_FONT_SIZE_MIN,
  TITLE_FONT_SIZE_MAX,
  TITLE_LINE_GAP_MIN,
  TITLE_LINE_GAP_MAX,
} from "./fonts";
import { normalizeHex } from "./title-colors";

export interface TitleStyle {
  font: string;
  weight: string;
  size: number; // 레거시 단일 크기(=첫 줄 크기 앵커). 하위호환 위해 유지.
  line1Size: number;
  line2Size: number;
  lineGap: number;
  color1: string;
  color2: string;
}

const STYLE_KEY = "blogpick-yt-title-style";

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
    const clampSize = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(TITLE_FONT_SIZE_MIN, Math.min(TITLE_FONT_SIZE_MAX, Math.round(v)))
        : undefined;
    const s = clampSize(p.size);
    if (s !== undefined) out.size = s;
    const l1 = clampSize(p.line1Size);
    if (l1 !== undefined) out.line1Size = l1;
    const l2 = clampSize(p.line2Size);
    if (l2 !== undefined) out.line2Size = l2;
    if (typeof p.lineGap === "number" && Number.isFinite(p.lineGap)) {
      out.lineGap = Math.max(TITLE_LINE_GAP_MIN, Math.min(TITLE_LINE_GAP_MAX, Math.round(p.lineGap)));
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

// "저장한 색" 팔레트는 여러 기기 동기화를 위해 백엔드 스토어로 옮겼다 → saved-colors-store.ts.
// (이 파일은 이제 기기-로컬 "마지막 스타일" 자동 기억만 담당한다.)
