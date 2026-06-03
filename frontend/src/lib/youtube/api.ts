"use client";

// 유튜브 백엔드 API 를 같은-origin 프록시(/api/youtube)로 호출하는 클라이언트 헬퍼.
// 백엔드 절대경로(/health, /api/jobs/... 등)를 받아 프록시 prefix 를 붙인다.
// 백엔드가 응답으로 내려주는 root-relative URL(/api/jobs/{id}/images/0)도 ytUrl() 로 감싸면
// 그대로 프록시 경유가 된다.

export const YT_PROXY_PREFIX = "/api/youtube";

/** 백엔드 절대경로(`/api/...`) → 프록시 경유 URL(`/api/youtube/api/...`). */
export function ytUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`ytUrl path must start with '/': ${path}`);
  }
  return `${YT_PROXY_PREFIX}${path}`;
}

/** 프록시 경유 fetch. 호스트 세션 쿠키 전달을 위해 credentials 포함. */
export function ytFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(ytUrl(path), { credentials: "same-origin", ...init });
}
