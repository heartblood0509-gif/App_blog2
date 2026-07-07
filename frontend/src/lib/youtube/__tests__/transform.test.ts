import { describe, it, expect } from "vitest";
import {
  clampTransform,
  computePlacement,
  isDefaultTransform,
  DEFAULT_TRANSFORM,
  SCALE_MAX,
  OFFSET_MAX,
} from "../transform";

// 백엔드 tests/test_transform_placement.py 의 PLACEMENT_CASES 와 **글자 그대로 같은 값**.
// (한쪽을 고치면 양쪽을 고칠 것 — 이 일치가 WYSIWYG 를 보장한다.)
const W = 1080;
const H = 1920;
const CASES: [string, number, number, { scale: number; x: number; y: number }, [number, number, number, number]][] = [
  ["landscape_16_9_cover", 1920, 1080, { scale: 1, x: 0, y: 0 }, [3413.3333, 1920.0, -1166.6667, 0.0]],
  ["portrait_9_16_identity", 1080, 1920, { scale: 1, x: 0, y: 0 }, [1080.0, 1920.0, 0.0, 0.0]],
  ["portrait_9_16_half", 1080, 1920, { scale: 0.5, x: 0, y: 0 }, [540.0, 960.0, 270.0, 480.0]],
  ["portrait_3_4", 1200, 1600, { scale: 1, x: 0, y: 0 }, [1440.0, 1920.0, -180.0, 0.0]],
  ["landscape_offset", 1920, 1080, { scale: 1, x: 0.25, y: -0.1 }, [3413.3333, 1920.0, -896.6667, -192.0]],
  ["square_cover", 1000, 1000, { scale: 1, x: 0, y: 0 }, [1920.0, 1920.0, -420.0, 0.0]],
];

describe("computePlacement matches backend shared table", () => {
  for (const [name, sw, sh, t, [dw, dh, left, top]] of CASES) {
    it(name, () => {
      const p = computePlacement(sw, sh, t, W, H);
      expect(p.width).toBeCloseTo(dw, 3);
      expect(p.height).toBeCloseTo(dh, 3);
      expect(p.left).toBeCloseTo(left, 3);
      expect(p.top).toBeCloseTo(top, 3);
    });
  }
});

describe("clampTransform", () => {
  it("defaults on null/garbage", () => {
    expect(clampTransform(null)).toEqual(DEFAULT_TRANSFORM);
    expect(clampTransform({ scale: NaN, x: Infinity, y: undefined })).toEqual(DEFAULT_TRANSFORM);
  });
  it("clamps out-of-range", () => {
    expect(clampTransform({ scale: 99, x: 9, y: -9 })).toEqual({ scale: SCALE_MAX, x: OFFSET_MAX, y: -OFFSET_MAX });
  });
});

describe("isDefaultTransform", () => {
  it("true for default / null", () => {
    expect(isDefaultTransform(null)).toBe(true);
    expect(isDefaultTransform({ scale: 1, x: 0, y: 0 })).toBe(true);
  });
  it("false when adjusted", () => {
    expect(isDefaultTransform({ scale: 1.2, x: 0, y: 0 })).toBe(false);
  });
});

describe("cover baseline", () => {
  it("landscape fills height and overflows width", () => {
    const p = computePlacement(1920, 1080, DEFAULT_TRANSFORM, W, H);
    expect(p.height).toBeCloseTo(1920, 3);
    expect(p.width).toBeGreaterThan(W);
  });
});
