import { CONFIG } from "@/lib/config";
import {
  type ReasonCode,
  NON_RETRYABLE,
  sleep,
  jitter,
  pickBackoff,
  parseRetryAfter,
  mapStatusToReason,
  type ServerResponseBody,
} from "@/lib/ai/retry-classify";

// 다른 모듈이 lib/image-bulk 에서 ReasonCode 를 import 하던 경로 보존.
export type { ReasonCode };

/**
 * 이미지 일괄 생성 — 클라이언트 병렬 풀.
 *
 * 핵심 책임:
 *  - 동시성 풀 (기본 3) + 새 fetch 시작 사이 최소 간격 (기본 6초)
 *  - AIMD 적응형 스로틀: 429 시 동시성 절반, 성공 N개 연속 시 +1 회복
 *  - 슬롯 단위 재시도 (retryAfterMs 우선, 없으면 fallback backoff + jitter)
 *  - 슬롯당 90초 timeout (재시도 안 함 — 중복 생성 방지)
 *  - roundId/slotVersion 전달 → 콜백에서 stale write 검증 가능
 */

export interface SlotPayload {
  id: string;
  index: number;
  description: string;
  groupId: string | null;
  mode: "ai" | "userPhoto";
  userPhoto?: {
    base64: string;
    mimeType: string;
    instruction?: string;
  };
  useProModel?: boolean;
  customPrompt?: string;
}

export interface SlotJob {
  slotPayload: SlotPayload;
  slotVersion: number;
}

export type SlotOutcome =
  | {
      id: string;
      status: "done";
      roundId: string;
      slotVersion: number;
      base64: string;
      mimeType: string;
    }
  | {
      id: string;
      status: "failed";
      roundId: string;
      slotVersion: number;
      reasonCode: ReasonCode;
      message?: string;
    }
  | {
      id: string;
      status: "aborted";
      roundId: string;
      slotVersion: number;
    };

export interface RunOptions {
  roundId: string;
  /** 라운드 전체 abort signal (사용자 [중지] / 라운드 폐기) */
  signal: AbortSignal;
  /** 슬롯이 풀에서 launch되어 실제 fetch가 시작될 때 */
  onSlotStart: (slotId: string) => void;
  /** 슬롯 작업이 끝났을 때 (성공/실패/취소) */
  onSlotDone: (out: SlotOutcome) => void;
  /** AIMD/스로틀 디버깅용 (선택) */
  onThrottle?: (info: {
    concurrency: number;
    reason: "down_429" | "up_success" | "init";
  }) => void;
}

async function runOneSlotWithRetry(
  job: SlotJob,
  content: string,
  apiKey: string | undefined,
  opts: RunOptions
): Promise<SlotOutcome> {
  const { roundId, signal } = opts;
  const { id } = job.slotPayload;
  let attempt = 0;

  while (true) {
    // 슬롯 단위 timeout + 라운드 abort 전파
    const slotAbort = new AbortController();
    const onParentAbort = () => slotAbort.abort();
    signal.addEventListener("abort", onParentAbort);
    const timeoutTimer = setTimeout(() => {
      slotAbort.abort(new DOMException("Timeout", "TimeoutError"));
    }, CONFIG.IMAGE_PER_SLOT_TIMEOUT_MS);

    let res: Response | null = null;
    try {
      res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          slots: [job.slotPayload],
          apiKey,
          roundId,
        }),
        signal: slotAbort.signal,
      });

      const json = (await res.json().catch(() => null)) as ServerResponseBody | null;

      // 성공 경로 (HTTP 2xx)
      if (res.ok) {
        const row = json?.results?.[0];
        if (row?.status === "done" && row.base64 && row.mimeType) {
          return {
            id,
            status: "done",
            roundId,
            slotVersion: job.slotVersion,
            base64: row.base64,
            mimeType: row.mimeType,
          };
        }
        // HTTP 200인데 failed (SAFETY/empty) → 재시도 무의미
        const reasonCode = (row?.reasonCode ?? "empty") as ReasonCode;
        return {
          id,
          status: "failed",
          roundId,
          slotVersion: job.slotVersion,
          reasonCode,
          message: row?.error,
        };
      }

      // HTTP 에러 경로
      const reasonCode = mapStatusToReason(res.status, json?.reasonCode);
      const retryAfterMs = parseRetryAfter(res.headers, json);

      if (NON_RETRYABLE.has(reasonCode) || attempt >= CONFIG.IMAGE_TRANSIENT_RETRIES) {
        return {
          id,
          status: "failed",
          roundId,
          slotVersion: job.slotVersion,
          reasonCode,
          message: json?.error,
        };
      }

      attempt++;
      const wait =
        retryAfterMs ??
        pickBackoff(CONFIG.IMAGE_BACKOFF_FALLBACK_MS, attempt);
      await sleep(jitter(wait), signal);
      continue;
    } catch (e) {
      const isTimeout =
        e instanceof DOMException && e.name === "TimeoutError";
      const isAbort =
        e instanceof DOMException && e.name === "AbortError" && !isTimeout;

      // slotAbort이 timeout으로 끊은 경우, fetch는 AbortError로 떨어진다 → reason 확인
      const wasTimeout =
        isTimeout ||
        (slotAbort.signal.aborted &&
          slotAbort.signal.reason instanceof DOMException &&
          slotAbort.signal.reason.name === "TimeoutError");

      if (wasTimeout) {
        // 재시도 안 함 (중복 생성 방지)
        return {
          id,
          status: "failed",
          roundId,
          slotVersion: job.slotVersion,
          reasonCode: "timeout",
        };
      }
      if (isAbort || signal.aborted) {
        return { id, status: "aborted", roundId, slotVersion: job.slotVersion };
      }

      // 네트워크 에러 — backoff 재시도
      if (attempt >= CONFIG.IMAGE_TRANSIENT_RETRIES) {
        return {
          id,
          status: "failed",
          roundId,
          slotVersion: job.slotVersion,
          reasonCode: "network",
          message: e instanceof Error ? e.message : String(e),
        };
      }
      attempt++;
      const wait = pickBackoff(CONFIG.IMAGE_BACKOFF_NETWORK_MS, attempt);
      try {
        await sleep(jitter(wait), signal);
      } catch {
        return { id, status: "aborted", roundId, slotVersion: job.slotVersion };
      }
      continue;
    } finally {
      clearTimeout(timeoutTimer);
      signal.removeEventListener("abort", onParentAbort);
    }
  }
}

export async function runImageBulk(
  jobs: SlotJob[],
  content: string,
  apiKey: string | undefined,
  opts: RunOptions
): Promise<void> {
  const max: number = CONFIG.IMAGE_BULK_CONCURRENCY_DEFAULT;
  let concurrency: number = max;
  let consecutiveDone = 0;
  let lastStartAt = 0;
  let started = 0;

  opts.onThrottle?.({ concurrency, reason: "init" });

  const queue = [...jobs];
  const inflight = new Set<Promise<void>>();

  const launch = (job: SlotJob): Promise<void> => {
    const p = (async () => {
      // 최소 시작 간격 — 새 fetch 시작 사이 텀
      const now = Date.now();
      const wait = Math.max(
        0,
        lastStartAt + CONFIG.IMAGE_BULK_MIN_START_INTERVAL_MS - now
      );
      // 첫 번째 슬롯(started=0)에는 간격 적용 안 함
      if (started > 0 && wait > 0) {
        try {
          await sleep(wait, opts.signal);
        } catch {
          opts.onSlotDone({
            id: job.slotPayload.id,
            status: "aborted",
            roundId: opts.roundId,
            slotVersion: job.slotVersion,
          });
          return;
        }
      }
      lastStartAt = Date.now();
      started++;

      if (opts.signal.aborted) {
        opts.onSlotDone({
          id: job.slotPayload.id,
          status: "aborted",
          roundId: opts.roundId,
          slotVersion: job.slotVersion,
        });
        return;
      }

      opts.onSlotStart(job.slotPayload.id);
      const outcome = await runOneSlotWithRetry(job, content, apiKey, opts);

      // AIMD 적응형 스로틀
      if (outcome.status === "done") {
        consecutiveDone++;
        if (
          consecutiveDone >= CONFIG.IMAGE_AIMD_RECOVERY_AFTER_N &&
          concurrency < max
        ) {
          concurrency = Math.min(max, concurrency + 1);
          consecutiveDone = 0;
          opts.onThrottle?.({ concurrency, reason: "up_success" });
        }
      } else if (
        outcome.status === "failed" &&
        outcome.reasonCode === "quota"
      ) {
        consecutiveDone = 0;
        concurrency = Math.max(1, Math.floor(concurrency / 2));
        opts.onThrottle?.({ concurrency, reason: "down_429" });
      }

      opts.onSlotDone(outcome);
    })();
    inflight.add(p);
    p.finally(() => inflight.delete(p));
    return p;
  };

  while (queue.length > 0 || inflight.size > 0) {
    while (inflight.size < concurrency && queue.length > 0 && !opts.signal.aborted) {
      launch(queue.shift()!);
    }
    if (inflight.size === 0) break;
    await Promise.race(inflight).catch(() => {
      // 개별 promise 내부에서 catch 처리하므로 여기는 통과
    });
    // abort 시 남은 큐는 즉시 비우고 aborted 알림
    if (opts.signal.aborted && queue.length > 0) {
      for (const job of queue) {
        opts.onSlotDone({
          id: job.slotPayload.id,
          status: "aborted",
          roundId: opts.roundId,
          slotVersion: job.slotVersion,
        });
      }
      queue.length = 0;
    }
  }
}

export function reasonCodeToLabel(code: ReasonCode): string {
  switch (code) {
    case "safety":
      return "SAFETY 차단 (재시도 권장)";
    case "quota":
      return "쿼터 초과 (잠시 후 재시도)";
    case "quota_free_tier":
      return "무료 등급 한도 (키 재발급 필요)";
    case "unavailable":
      return "Gemini 일시 장애";
    case "internal":
      return "Gemini 내부 오류";
    case "deadline":
      return "응답 너무 큼 (프롬프트 단순화 필요)";
    case "timeout":
      return `시간 초과 (${Math.round(CONFIG.IMAGE_PER_SLOT_TIMEOUT_MS / 1000)}초)`;
    case "network":
      return "네트워크 오류";
    case "empty":
      return "응답 없음";
    case "permission":
      return "API 키 권한/결제 문제";
    case "not_found":
      return "모델/엔드포인트 오류";
    case "precondition":
      return "지역/요금제 조건 불충족";
    case "auth":
      return "API 키 오류";
    case "bad_request":
      return "잘못된 요청";
    case "unknown":
    default:
      return "알 수 없는 오류";
  }
}
