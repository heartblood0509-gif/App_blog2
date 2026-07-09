import { describe, it, expect } from "vitest";
import {
  clampTransform,
  computePlacement,
  isDefaultTransform,
  DEFAULT_TRANSFORM,
  SCALE_MAX,
  OFFSET_MAX,
  DEFAULT_MOTION_SPEED,
  MOTION_SPEED_PCT_MIN,
  MOTION_SPEED_PCT_MAX,
  rateFromSpeedPct,
  speedPctFromRate,
  fitScale,
  SCALE_MIN,
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

describe("motion speed pct <-> rate", () => {
  it("100% maps to the default rate, and round-trips", () => {
    expect(rateFromSpeedPct(100)).toBeCloseTo(DEFAULT_MOTION_SPEED, 10);
    expect(speedPctFromRate(DEFAULT_MOTION_SPEED)).toBe(100);
  });
  it("scales linearly (200% = 2x default)", () => {
    expect(rateFromSpeedPct(200)).toBeCloseTo(DEFAULT_MOTION_SPEED * 2, 10);
    expect(speedPctFromRate(DEFAULT_MOTION_SPEED * 2)).toBe(200);
  });
  it("clamps out-of-range pct to slider bounds", () => {
    expect(rateFromSpeedPct(9999)).toBeCloseTo(DEFAULT_MOTION_SPEED * (MOTION_SPEED_PCT_MAX / 100), 10);
    expect(rateFromSpeedPct(0)).toBeCloseTo(DEFAULT_MOTION_SPEED * (MOTION_SPEED_PCT_MIN / 100), 10);
  });
  it("clamps derived pct to slider bounds and survives garbage", () => {
    expect(speedPctFromRate(999)).toBe(MOTION_SPEED_PCT_MAX);
    expect(speedPctFromRate(0)).toBe(MOTION_SPEED_PCT_MIN);
    expect(speedPctFromRate(NaN)).toBe(100); // finite() 폴백 = 기본 rate → 100%
  });
});

// 백엔드 tests/test_layout_blur.py 의 fit_transform 값과 **글자 그대로 같은 값**(WYSIWYG).
describe("fitScale matches backend fit_transform", () => {
  it("landscape 1920x1080 → 0.31640625", () => {
    expect(fitScale(1920, 1080, W, H)).toBeCloseTo(0.31640625, 6);
  });
  it("square 1000x1000 → 0.5625", () => {
    expect(fitScale(1000, 1000, W, H)).toBeCloseTo(0.5625, 6);
  });
  it("9:16 media → 1.0 (fit == cover)", () => {
    expect(fitScale(1080, 1920, W, H)).toBeCloseTo(1.0, 6);
    expect(fitScale(864, 1536, W, H)).toBeCloseTo(1.0, 6);
  });
  it("extreme panorama clamps to SCALE_MIN", () => {
    expect(fitScale(10000, 500, W, H)).toBe(SCALE_MIN);
  });
});
