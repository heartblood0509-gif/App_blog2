// 카드 B 자산 위치/배율(transform) — 프리뷰와 최종 렌더가 공유하는 배치 수식.
//
// ⚠️ 백엔드 youtube-backend/core/image_pipeline.py 의 placement_floats / normalize_transform
//    과 **반드시 동일 수식**이어야 프리뷰(폭 350px)와 렌더(폭 1080px)가 일치(WYSIWYG)한다.
//    한쪽을 고치면 양쪽을 고치고, tests(transform.test.ts / test_transform_placement.py)의
//    공유 수치 테이블도 함께 맞출 것.
//
// 기준(scale=1,x=0,y=0)은 cover-fit: base = max(W/sw, H/sh) — 원본이 프레임을 꽉 채우고
// 넘치는 쪽은 잘림·중앙. scale<1 이면 축소(원본 전체가 보이도록, 여백 검정), >1 이면 확대.
// x/y 는 자산 중심이 프레임 중심에서 벗어난 정도(프레임 폭/높이 대비 비율).

export interface LineTransform {
  scale: number;
  x: number;
  y: number;
}

export const DEFAULT_TRANSFORM: LineTransform = { scale: 1, x: 0, y: 0 };
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 3.0;
export const OFFSET_MAX = 1.5;

function finite(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampTransform(t: Partial<LineTransform> | null | undefined): LineTransform {
  if (!t || typeof t !== "object") return { ...DEFAULT_TRANSFORM };
  return {
    scale: clampNum(finite(t.scale, 1), SCALE_MIN, SCALE_MAX),
    x: clampNum(finite(t.x, 0), -OFFSET_MAX, OFFSET_MAX),
    y: clampNum(finite(t.y, 0), -OFFSET_MAX, OFFSET_MAX),
  };
}

export interface Placement {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** 원본 픽셀(srcW×srcH)을 transform 대로 frameW×frameH 프레임에 배치한 결과(실수 px). */
export function computePlacement(
  srcW: number,
  srcH: number,
  transform: Partial<LineTransform> | null | undefined,
  frameW: number,
  frameH: number,
): Placement {
  const t = clampTransform(transform);
  const sw = Math.max(1, srcW || 1);
  const sh = Math.max(1, srcH || 1);
  const base = Math.max(frameW / sw, frameH / sh);
  const width = sw * base * t.scale;
  const height = sh * base * t.scale;
  const left = frameW / 2 + t.x * frameW - width / 2;
  const top = frameH / 2 + t.y * frameH - height / 2;
  return { width, height, left, top };
}

export function isDefaultTransform(t: Partial<LineTransform> | null | undefined): boolean {
  const c = clampTransform(t);
  return c.scale === 1 && c.x === 0 && c.y === 0;
}
