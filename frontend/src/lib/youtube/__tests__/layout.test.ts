import { describe, it, expect } from "vitest";
import {
  sigmaFromBlurPct,
  blurPctFromSigma,
  BLUR_SIGMA_DEFAULT,
  BLUR_PCT_MIN,
  BLUR_PCT_MAX,
} from "../layout";

describe("blur sigma <-> pct", () => {
  it("100% maps to default sigma and round-trips", () => {
    expect(sigmaFromBlurPct(100)).toBe(BLUR_SIGMA_DEFAULT);
    expect(blurPctFromSigma(BLUR_SIGMA_DEFAULT)).toBe(100);
  });
  it("scales linearly (200% = 2x default sigma)", () => {
    expect(sigmaFromBlurPct(200)).toBe(BLUR_SIGMA_DEFAULT * 2);
    expect(blurPctFromSigma(BLUR_SIGMA_DEFAULT * 2)).toBe(200);
  });
  it("clamps pct to slider bounds", () => {
    expect(sigmaFromBlurPct(9999)).toBe(BLUR_SIGMA_DEFAULT * (BLUR_PCT_MAX / 100));
    expect(sigmaFromBlurPct(0)).toBe(BLUR_SIGMA_DEFAULT * (BLUR_PCT_MIN / 100));
  });
  it("clamps derived pct and survives garbage", () => {
    expect(blurPctFromSigma(9999)).toBe(BLUR_PCT_MAX);
    expect(blurPctFromSigma(0)).toBe(BLUR_PCT_MIN);
    expect(blurPctFromSigma(NaN)).toBe(100); // 폴백 = 기본 sigma → 100%
  });
});
