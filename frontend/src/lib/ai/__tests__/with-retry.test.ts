import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetryAsync } from "../with-retry";

function apiError(status: number, statusText = "RESOURCE_EXHAUSTED"): Error {
  return Object.assign(
    new Error(JSON.stringify({ error: { code: status, status: statusText } })),
    { status }
  );
}

const OPTS = { retries: 2, backoffMs: [10, 20] as const };

describe("withRetryAsync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("성공하면 한 번에 반환(재시도 없음)", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const r = await withRetryAsync(fn, OPTS);
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("일시적 429 후 성공 → 재시도해서 성공", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValue("ok");
    const p = withRetryAsync(fn, OPTS);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("무료등급(non-retryable)은 재시도 없이 즉시 throw", async () => {
    const err = Object.assign(
      new Error(
        JSON.stringify({
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                violations: [{ quotaId: "X-FreeTier" }],
              },
            ],
          },
        })
      ),
      { status: 429 }
    );
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetryAsync(fn, OPTS)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("계속 429면 재시도 소진 후 원본 throw (첫 시도 + retries회)", async () => {
    const err = apiError(429);
    const fn = vi.fn().mockRejectedValue(err);
    const p = withRetryAsync(fn, OPTS);
    const assertion = expect(p).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2
  });
});
