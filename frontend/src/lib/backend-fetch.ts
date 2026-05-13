// §A-1 — Next API route 가 Python 백엔드를 호출할 때 X-App-Token 헤더를 자동 첨부.
// 모든 frontend/src/app/api/**/route.ts 가 fetch(BACKEND_URL+...) 대신 backendFetch(path) 를 써야 한다.
//
// 단일 진입점으로 두면 헤더 누락이 lint/PR 리뷰로 잡힘.

import { CONFIG } from "@/lib/config";

interface BackendFetchInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
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
  const headers: Record<string, string> = {
    ...(init.headers ?? {}),
    "X-App-Token": appToken(),
  };
  return fetch(url, { ...init, headers });
}
