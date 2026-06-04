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

async function asError(r: Response): Promise<Error> {
  let detail = "";
  try {
    const data = await r.clone().json();
    detail = (data?.detail ?? data?.error ?? "").toString();
  } catch {
    detail = (await r.text().catch(() => "")).slice(0, 200);
  }
  return new Error(detail || `요청 실패 (${r.status})`);
}

/** 프록시 경유 GET → JSON. */
export async function ytGetJson<T>(path: string): Promise<T> {
  const r = await ytFetch(path);
  if (!r.ok) throw await asError(r);
  return (await r.json()) as T;
}

/** 프록시 경유 GET → Blob(오디오/이미지 등 바이너리). */
export async function ytGetBlob(path: string): Promise<Blob> {
  const r = await ytFetch(path);
  if (!r.ok) throw await asError(r);
  return await r.blob();
}

/** 프록시 경유 POST(JSON 본문) → JSON. */
export async function ytPostJson<T>(path: string, body: unknown): Promise<T> {
  const r = await ytFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await asError(r);
  return (await r.json()) as T;
}

/** 프록시 경유 PUT(JSON 본문) → JSON. */
export async function ytPutJson<T>(path: string, body: unknown): Promise<T> {
  const r = await ytFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await asError(r);
  return (await r.json()) as T;
}

/** 프록시 경유 multipart POST(FormData) → JSON. Content-Type 은 브라우저가 boundary 와 함께 설정. */
export async function ytPostForm<T>(path: string, form: FormData): Promise<T> {
  const r = await ytFetch(path, { method: "POST", body: form });
  if (!r.ok) throw await asError(r);
  return (await r.json()) as T;
}

/** 프록시 경유 DELETE → JSON. */
export async function ytDelete<T>(path: string): Promise<T> {
  const r = await ytFetch(path, { method: "DELETE" });
  if (!r.ok) throw await asError(r);
  return (await r.json()) as T;
}
