/**
 * 서버측 텍스트 생성 재시도 래퍼 (Node 전용 — API 라우트에서 사용).
 *
 * generateText / collectStream 같은 Promise를 통째로 감싸 429/503/500을
 * parseGeminiError로 판정해 재시도한다. 본문 생성은 서버에서 버퍼링(collectStream)
 * 하므로 통째 재시도해도 클라이언트엔 중복이 안 나간다.
 *
 * 재시도 소진/비재시도 에러는 원본 err를 그대로 throw → 상위 catch가
 * geminiErrorResponse(retry-classify)로 분류해 reasonCode와 함께 응답한다.
 */
import { parseGeminiError, pickBackoff, jitter, sleep } from "@/lib/ai/retry-classify";

export interface RetryOptions {
  /** 첫 시도 외 추가 재시도 횟수. */
  retries: number;
  /** retryAfter가 없을 때 쓰는 fallback 백오프 테이블(ms). */
  backoffMs: readonly number[];
}

export async function withRetryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const parsed = parseGeminiError(err);
      // 비재시도(quota_free_tier/auth/bad_request/deadline 등) 또는 소진 → 원본 throw
      if (!parsed.retryable || attempt > opts.retries) throw err;
      const wait = parsed.retryAfterMs ?? pickBackoff(opts.backoffMs, attempt);
      await sleep(jitter(wait));
    }
  }
}
