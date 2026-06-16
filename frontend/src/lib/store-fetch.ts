/**
 * 프로필/분석 목록 GET 공용 헬퍼.
 *
 * 백엔드 저장소 손상(503 + code="store_corrupt")을 StoreCorruptError 로 구분한다 →
 * 섹션이 "빈 목록"으로 오인하지 않고 복구 패널을 띄울 수 있게 한다.
 * (저장소는 데이터를 삭제하지 않고 .corrupt 로 보존하며, 대부분 .bak 에서 자동 복구된다.)
 */

export class StoreCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreCorruptError";
  }
}

/** GET 한 뒤 배열을 돌려준다. 저장소 손상이면 StoreCorruptError, 그 외 실패는 Error. */
export async function fetchStoreList<T = unknown>(url: string): Promise<T[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.ok) {
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.status === 503 && body.code === "store_corrupt") {
    throw new StoreCorruptError(body.error || "저장소가 손상되어 불러올 수 없습니다.");
  }
  throw new Error(body.error || "목록을 불러오지 못했습니다.");
}
