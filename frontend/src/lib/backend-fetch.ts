// §A-1 — Next API route 가 Python 백엔드를 호출할 때 X-App-Token 헤더를 자동 첨부.
// 모든 frontend/src/app/api/**/route.ts 가 fetch(BACKEND_URL+...) 대신 backendFetch(path) 를 써야 한다.
//
// 단일 진입점으로 두면 헤더 누락이 lint/PR 리뷰로 잡힘.

import { Agent } from "undici";
import { CONFIG } from "@/lib/config";

interface BackendFetchInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  /**
   * 발행처럼 수 분 동안 응답 헤더가 안 오는 동기 백엔드 작업용.
   * Node fetch(undici)의 기본 headersTimeout(300초)에 걸려 멀쩡한 작업이
   * "fetch failed"로 오인되는 걸 막는다. (브라우저 자동화는 글 길이/이미지에 따라 5분 초과 가능)
   */
  longRunning?: boolean;
}

// 긴 동기 작업 전용 dispatcher. 0(무제한)은 진짜 hang 시 영구 대기라 위험 →
// 넉넉한 상한(30분)만 둔다. lazy 싱글톤(요청마다 새 커넥션 풀을 만들지 않음).
let _longRunningDispatcher: Agent | undefined;
function longRunningDispatcher(): Agent {
  if (!_longRunningDispatcher) {
    _longRunningDispatcher = new Agent({
      headersTimeout: 30 * 60_000,
      bodyTimeout: 30 * 60_000,
    });
  }
  return _longRunningDispatcher;
}

function appToken(): string {
  const t = process.env.APP_TOKEN;
  if (!t) {
    // dev 모드에서 ALLOW_INSECURE_DEV_AUTH=1 인 경우 backend 가 토큰 부재를 통과시키므로,
    // 빈 헤더로도 호출이 가능하다. 그래도 명시적으로 빈 문자열을 보내 진단을 쉽게.
    return "";
  }
  return t;
}

/**
 * 백엔드로 가는 모든 fetch 의 단일 진입점. 절대경로 (`/publish/...`) 만 받음.
 */
export function backendFetch(
  path: string,
  init: BackendFetchInit = {},
): Promise<Response> {
  if (!path.startsWith("/")) {
    throw new Error(`backendFetch path must start with '/': ${path}`);
  }
  const url = `${CONFIG.BACKEND_URL}${path}`;
  const { longRunning, ...rest } = init;
  const headers: Record<string, string> = {
    ...(init.headers ?? {}),
    "X-App-Token": appToken(),
  };
  // dispatcher 는 표준 RequestInit 엔 없지만 Node(undici) fetch 가 런타임에 읽는다.
  const requestInit: RequestInit & { dispatcher?: Agent } = { ...rest, headers };
  if (longRunning) {
    requestInit.dispatcher = longRunningDispatcher();
  }
  return fetch(url, requestInit);
}
