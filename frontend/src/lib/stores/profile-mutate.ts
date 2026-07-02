/**
 * 프로필/보관함 쓰기(생성·수정·삭제) 공용 래퍼.
 *
 * fetch 와 동일한 시그니처라 호출부에서 `fetch(` → `mutateProfileStore(` 로만 바꾸면 된다.
 * 쓰기(POST/PUT/DELETE)가 성공하면 해당 kind 의 동기화 reconcile 을 디바운스 예약한다.
 * (M2 엔진이 로컬↔클라우드를 항목단위로 맞춘다 — 생성·수정·삭제 모두 전파.)
 * 이렇게 한 곳으로 모아 두어, 새로운 저장 경로가 생겨도 누락 없이 동기화된다.
 *
 * GET 등 비쓰기 호출은 예약하지 않으므로, 안전하게 fetch 대용으로 써도 된다.
 * 동기화 컨텍스트(로그인·데스크톱)가 없으면 scheduleReconcile 은 no-op 이라 저장 자체엔 영향 없음.
 */
import { kindFromUrl, scheduleReconcile } from "@/lib/sync/profile-sync-engine";

export async function mutateProfileStore(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  if (res.ok && (method === "POST" || method === "PUT" || method === "DELETE")) {
    const kind = kindFromUrl(input);
    if (kind) scheduleReconcile(kind);
  }
  return res;
}
