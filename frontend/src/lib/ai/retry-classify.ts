/**
 * 재시도 분류 · 백오프 공통 유틸 (브라우저/Node 양립, 의존성 0).
 *
 * 기존에 lib/image-bulk.ts(클라 풀)와 app/api/images/generate/route.ts(서버)에
 * 흩어져 있던 순수 함수/타입을 한곳으로 모은 것. 텍스트 생성 재시도(with-retry.ts)와
 * 이미지 일괄생성이 같은 분류/백오프 규칙을 공유한다.
 *
 * 동작 보존 원칙: 여기로 옮긴 함수들의 구현은 원본과 동일하다(quota_free_tier 분기만 추가).
 */

// ── 실패 원인 코드 ──────────────────────────────────────────
// image-bulk(14종) ∪ images/route(12종) 합집합 + quota_free_tier(무료등급 묶임/유료 잔액 소진).
export type ReasonCode =
  | "safety"
  | "quota"
  | "quota_free_tier"
  | "unavailable"
  | "internal"
  | "deadline"
  | "timeout"
  | "network"
  | "empty"
  | "permission"
  | "not_found"
  | "precondition"
  | "bad_request"
  | "auth"
  | "unknown";

// 재시도해도 의미 없는(또는 위험한) 코드. quota_free_tier 포함:
// 무료등급 한도/유료 잔액 소진은 기다려도 안 풀림 → 즉시 안내로.
export const NON_RETRYABLE: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  "permission",
  "not_found",
  "precondition",
  "bad_request",
  "auth",
  "deadline",
  "safety",
  "empty",
  "timeout",
  "quota_free_tier",
]);

// ── 백오프 헬퍼 ─────────────────────────────────────────────

/** AbortSignal을 준수하는 취소 가능 대기. signal 생략 시 단순 setTimeout. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** ±20% 지터. */
export function jitter(ms: number): number {
  const factor = 0.8 + Math.random() * 0.4;
  return Math.max(0, Math.round(ms * factor));
}

/** attempt(1,2,3...)에 맞춰 backoff 배열에서 대기시간 선택. */
export function pickBackoff(table: readonly number[], attempt: number): number {
  return table[attempt - 1] ?? table[table.length - 1] ?? 5_000;
}

// ── 서버 응답(이미지 슬롯) 형태 + Retry-After 파싱 ──────────────

export interface ServerResultRow {
  id: string;
  status: "done" | "failed" | "skipped";
  base64?: string;
  mimeType?: string;
  reasonCode?: ReasonCode;
  retryable?: boolean;
  retryAfterMs?: number;
  error?: string;
}

export interface ServerResponseBody {
  results?: ServerResultRow[];
  reasonCode?: ReasonCode;
  retryAfterMs?: number;
  error?: string;
}

/** HTTP Retry-After 헤더(초/HTTP-date) 우선, 없으면 본문 retryAfterMs. */
export function parseRetryAfter(
  headers: Headers,
  json: ServerResponseBody | null
): number | undefined {
  const h = headers.get("retry-after");
  if (h) {
    const s = parseInt(h, 10);
    if (!Number.isNaN(s)) return s * 1000;
    const d = Date.parse(h);
    if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  }
  if (json?.retryAfterMs && typeof json.retryAfterMs === "number") {
    return json.retryAfterMs;
  }
  if (
    json?.results?.[0]?.retryAfterMs &&
    typeof json.results[0].retryAfterMs === "number"
  ) {
    return json.results[0].retryAfterMs;
  }
  return undefined;
}

/** HTTP 상태코드 → ReasonCode (서버가 JSON으로 준 hint 우선). */
export function mapStatusToReason(
  httpStatus: number,
  hintFromJson?: ReasonCode
): ReasonCode {
  if (hintFromJson) return hintFromJson;
  switch (httpStatus) {
    case 429:
      return "quota";
    case 503:
      return "unavailable";
    case 504:
      return "deadline";
    case 500:
      return "internal";
    case 403:
      return "permission";
    case 404:
      return "not_found";
    case 401:
      return "auth";
    case 400:
      return "bad_request";
    default:
      return "unknown";
  }
}

// ── Gemini/OpenAI SDK 에러 분류 (images/generate/route.ts에서 이전) ──

export interface ParsedGeminiError {
  status: number;
  reasonCode: ReasonCode;
  retryable: boolean;
  retryAfterMs?: number;
  message: string;
}

/**
 * GenAI(@google/genai) SDK 에러는 보통 message 안에 전체 에러 JSON이 들어있거나
 * "[<status>] ... <reason>" 형태로 온다(SDK 1.50.0 확인: ApiError.message =
 * JSON.stringify(errorBody), status 별도 보존). OpenAI SDK 에러도 status/code를
 * 가지므로 같은 분류기를 태운다. 방어적으로 파싱한다.
 */
export function parseGeminiError(err: unknown): ParsedGeminiError {
  const message = err instanceof Error ? err.message : String(err);

  // 1) HTTP status code 추출
  let httpStatus = 0;
  const errObj = err as { status?: unknown; code?: unknown } | null;
  if (errObj && typeof errObj === "object") {
    if (typeof errObj.status === "number") httpStatus = errObj.status;
    else if (typeof errObj.code === "number") httpStatus = errObj.code;
  }
  if (!httpStatus) {
    const m = message.match(/\b(429|503|500|504|403|404|400|401)\b/);
    if (m) httpStatus = parseInt(m[1], 10);
  }

  // 2) message가 JSON일 수 있음 → status / RetryInfo 추출
  let statusText = "";
  let retryAfterMs: number | undefined;
  try {
    const jsonStart = message.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(message.slice(jsonStart));
      const errBlock = (parsed?.error ?? parsed) as Record<string, unknown>;
      if (typeof errBlock?.code === "number" && !httpStatus) {
        httpStatus = errBlock.code as number;
      }
      if (typeof errBlock?.status === "string") {
        statusText = errBlock.status as string;
      }
      const details = (errBlock?.details ?? []) as Array<Record<string, unknown>>;
      for (const d of details) {
        const t = (d?.["@type"] as string) || "";
        if (t.includes("RetryInfo") && typeof d?.retryDelay === "string") {
          const m = (d.retryDelay as string).match(/^([\d.]+)s$/);
          if (m) retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000);
        }
      }
    }
  } catch {
    // ignore
  }

  // 3) "retry in Xs" 텍스트 보조 파싱
  if (retryAfterMs == null) {
    const m = message.match(/retry\s+(?:in|after)\s+(\d+)\s*s/i);
    if (m) retryAfterMs = parseInt(m[1], 10) * 1000;
  }

  // 4) 분류
  const upper = `${statusText} ${message}`.toUpperCase();
  let reasonCode: ReasonCode = "unknown";
  let status = httpStatus || 500;
  let retryable = false;

  if (httpStatus === 429 || /RESOURCE_EXHAUSTED|QUOTA/.test(upper)) {
    status = 429;
    // 무료등급 묶임(Gemini free_tier/limit:0) 또는 유료 잔액 소진(OpenAI insufficient_quota)
    // = 재시도해도 안 풀림 → 키 재발급/충전 안내. best-effort runtime 파싱(SDK 버전 의존).
    const freeTierOrExhausted =
      /FREE[_ -]?TIER|FREETIER|FREE_TIER_REQUESTS|INSUFFICIENT_QUOTA/i.test(
        message
      ) || /FREE[_ -]?TIER|INSUFFICIENT_QUOTA/.test(upper);
    if (freeTierOrExhausted) {
      reasonCode = "quota_free_tier";
      retryable = false;
    } else {
      reasonCode = "quota";
      retryable = true;
    }
  } else if (httpStatus === 503 || /UNAVAILABLE/.test(upper)) {
    reasonCode = "unavailable";
    status = 503;
    retryable = true;
  } else if (httpStatus === 504 || /DEADLINE_EXCEEDED/.test(upper)) {
    reasonCode = "deadline";
    status = 504;
    retryable = false; // payload 과다 가능성, 같은 입력 재시도 위험
  } else if (httpStatus === 500 || /INTERNAL/.test(upper)) {
    reasonCode = "internal";
    status = 500;
    retryable = true;
  } else if (httpStatus === 403 || /PERMISSION_DENIED/.test(upper)) {
    reasonCode = "permission";
    status = 403;
    retryable = false;
  } else if (httpStatus === 404 || /NOT_FOUND/.test(upper)) {
    reasonCode = "not_found";
    status = 404;
    retryable = false;
  } else if (httpStatus === 401 || /UNAUTHENTICATED|API.?KEY/.test(upper)) {
    reasonCode = "auth";
    status = 401;
    retryable = false;
  } else if (httpStatus === 400 && /FAILED_PRECONDITION/.test(upper)) {
    reasonCode = "precondition";
    status = 400;
    retryable = false;
  } else if (httpStatus === 400 || /INVALID_ARGUMENT/.test(upper)) {
    reasonCode = "bad_request";
    status = 400;
    retryable = false;
  }

  return { status, reasonCode, retryable, retryAfterMs, message };
}

/** ParsedGeminiError → 응답 헤더(Retry-After). */
export function buildHeaders(parsed: ParsedGeminiError): HeadersInit {
  const h: Record<string, string> = {};
  if (parsed.retryAfterMs != null) {
    h["Retry-After"] = String(Math.ceil(parsed.retryAfterMs / 1000));
  }
  return h;
}

/**
 * 텍스트 라우트 catch에서 쓰는 표준 에러 응답.
 * { error, reasonCode, retryAfterMs } + 적절한 HTTP status + Retry-After 헤더.
 * 프론트는 reasonCode를 읽어 원인별 안내(toast)로 분기한다.
 */
export function geminiErrorResponse(err: unknown): Response {
  const parsed = parseGeminiError(err);
  return Response.json(
    {
      error: parsed.message.slice(0, 500),
      reasonCode: parsed.reasonCode,
      retryAfterMs: parsed.retryAfterMs,
    },
    { status: parsed.status, headers: buildHeaders(parsed) }
  );
}
