import { describe, it, expect } from "vitest";
import {
  parseGeminiError,
  mapStatusToReason,
  pickBackoff,
  jitter,
  parseRetryAfter,
  NON_RETRYABLE,
} from "../retry-classify";

/** @google/genai ApiError 흉내 — message에 전체 에러 JSON, status 별도 보존. */
function apiError(status: number, body: Record<string, unknown>): Error {
  return Object.assign(new Error(JSON.stringify({ error: body })), { status });
}

describe("parseGeminiError", () => {
  it("일반 429 → quota (retryable)", () => {
    const p = parseGeminiError(
      apiError(429, { code: 429, status: "RESOURCE_EXHAUSTED", message: "busy" })
    );
    expect(p.reasonCode).toBe("quota");
    expect(p.retryable).toBe(true);
    expect(p.status).toBe(429);
  });

  it("무료등급(QuotaFailure FreeTier) 429 → quota_free_tier (non-retryable)", () => {
    const p = parseGeminiError(
      apiError(429, {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
              },
            ],
          },
        ],
      })
    );
    expect(p.reasonCode).toBe("quota_free_tier");
    expect(p.retryable).toBe(false);
  });

  it("OpenAI insufficient_quota(잔액소진) → quota_free_tier (non-retryable)", () => {
    const err = Object.assign(
      new Error("[openai 429 RESOURCE_EXHAUSTED] insufficient_quota: balance"),
      { status: 429 }
    );
    const p = parseGeminiError(err);
    expect(p.reasonCode).toBe("quota_free_tier");
    expect(p.retryable).toBe(false);
  });

  it("RetryInfo.retryDelay → retryAfterMs (초→ms)", () => {
    const p = parseGeminiError(
      apiError(429, {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "3s",
          },
        ],
      })
    );
    expect(p.retryAfterMs).toBe(3000);
  });

  it("503 → unavailable (retryable), 504 → deadline (non-retryable)", () => {
    expect(parseGeminiError(apiError(503, { code: 503 })).reasonCode).toBe(
      "unavailable"
    );
    expect(parseGeminiError(apiError(503, { code: 503 })).retryable).toBe(true);
    const d = parseGeminiError(apiError(504, { code: 504 }));
    expect(d.reasonCode).toBe("deadline");
    expect(d.retryable).toBe(false);
  });

  it("401 → auth, 400 → bad_request (모두 non-retryable)", () => {
    expect(parseGeminiError(apiError(401, { code: 401 })).reasonCode).toBe("auth");
    expect(parseGeminiError(apiError(400, { code: 400 })).reasonCode).toBe(
      "bad_request"
    );
    expect(NON_RETRYABLE.has("auth")).toBe(true);
    expect(NON_RETRYABLE.has("quota_free_tier")).toBe(true);
  });
});

describe("mapStatusToReason / pickBackoff / jitter / parseRetryAfter", () => {
  it("mapStatusToReason: json hint 우선, 없으면 status 매핑", () => {
    expect(mapStatusToReason(429, "quota_free_tier")).toBe("quota_free_tier");
    expect(mapStatusToReason(429)).toBe("quota");
    expect(mapStatusToReason(503)).toBe("unavailable");
  });

  it("pickBackoff: attempt 인덱싱, 초과 시 마지막 값", () => {
    expect(pickBackoff([4000, 12000], 1)).toBe(4000);
    expect(pickBackoff([4000, 12000], 2)).toBe(12000);
    expect(pickBackoff([4000, 12000], 5)).toBe(12000);
  });

  it("jitter: ±20% 범위 안", () => {
    for (let i = 0; i < 50; i++) {
      const v = jitter(1000);
      expect(v).toBeGreaterThanOrEqual(800);
      expect(v).toBeLessThanOrEqual(1200);
    }
  });

  it("parseRetryAfter: HTTP Retry-After 헤더(초) 우선", () => {
    const h = new Headers({ "retry-after": "5" });
    expect(parseRetryAfter(h, null)).toBe(5000);
    expect(parseRetryAfter(new Headers(), { retryAfterMs: 2500 })).toBe(2500);
  });
});
