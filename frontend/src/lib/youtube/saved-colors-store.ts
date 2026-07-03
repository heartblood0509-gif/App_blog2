// 쇼츠 제목 "저장한 색" 팔레트 — 백엔드 스토어(/api/saved-colors) 기반 클라이언트 캐시.
//
// M1 은 localStorage 였지만, M2 에서 여러 기기 동기화를 위해 백엔드 리스트 스토어로 옮겼다.
// 데스크톱은 로컬 백엔드가 항상 떠 있어 오프라인에서도 즉시 읽힌다. 로그인 시 동기화 엔진
// (profile-sync-engine, kind="saved-color")이 이 스토어를 클라우드와 항목단위로 맞춘다.
//
// 쓰기는 mutateProfileStore 로 보내 성공 시 reconcile 이 예약되고(→클라우드 push), 다른 기기의
// 변경이 로컬에 반영되면 emitProfilesChanged("saved-color") 가 와서 팔레트를 재조회한다.
// useSyncExternalStore 로 컬러 피커가 실시간 반영(안정 스냅샷 참조 유지).

import { fetchStoreList } from "@/lib/store-fetch";
import { mutateProfileStore } from "@/lib/stores/profile-mutate";
import { subscribeProfilesChanged } from "@/lib/sync/profile-sync-engine";
import { normalizeHex } from "./title-colors";

interface SavedColorItem {
  id: string;
  uuid?: string;
  hex: string;
  updatedAt?: string;
}

const URL_PATH = "/api/saved-colors";

let items: SavedColorItem[] = [];
let cachedHexes: string[] | null = null;
let loaded = false;
let loading = false;

const listeners = new Set<() => void>();
const EMPTY: string[] = [];

function notify(): void {
  cachedHexes = null;
  for (const l of listeners) l();
}

/** 백엔드에서 최신 팔레트를 읽어 캐시 갱신. 실패(미로그인·오프라인)면 조용히 무시. */
async function refresh(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const list = await fetchStoreList<SavedColorItem>(URL_PATH);
    // hex 정규화 + dedupe(손상 대비). 순서는 백엔드 순서 유지.
    const seen = new Set<string>();
    const next: SavedColorItem[] = [];
    for (const it of list) {
      const c = normalizeHex(String(it?.hex ?? ""));
      if (c && !seen.has(c)) {
        seen.add(c);
        next.push({ ...it, hex: c });
      }
    }
    items = next;
    loaded = true;
    notify();
  } catch {
    // 스토어 손상/네트워크 실패 — 기존 캐시 유지(빈 목록으로 덮지 않음).
  }
}

// 원격 동기화로 저장색이 바뀌면 재조회.
if (typeof window !== "undefined") {
  subscribeProfilesChanged((kind) => {
    if (kind === "saved-color" || kind === "all") void refresh();
  });
}

export function subscribeSavedColors(listener: () => void): () => void {
  listeners.add(listener);
  // 첫 구독 시 1회 로드(피커가 마운트되면 자동으로 최신 팔레트를 가져온다).
  if (!loaded && !loading) {
    loading = true;
    void refresh().finally(() => {
      loading = false;
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** 안정 참조 스냅샷(useSyncExternalStore 요구) — hex 목록. */
export function getSavedColorsSnapshot(): string[] {
  if (cachedHexes === null) cachedHexes = items.map((it) => it.hex);
  return cachedHexes;
}

/** SSR 스냅샷 — 서버에선 항상 빈 배열(동일 참조). */
export function getSavedColorsServerSnapshot(): string[] {
  return EMPTY;
}

/** 색 저장 — 백엔드 dedupe(같은 hex 면 멱등). 성공 시 재조회 + reconcile 예약. */
export async function addSavedColor(hex: string): Promise<void> {
  const c = normalizeHex(hex);
  if (!c) return;
  try {
    await mutateProfileStore(URL_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hex: c }),
    });
    await refresh();
  } catch {
    /* 저장 실패는 무시(다음 시도에서 복구) */
  }
}

export async function removeSavedColor(hex: string): Promise<void> {
  const c = normalizeHex(hex);
  if (!c) return;
  const target = items.find((it) => it.hex === c);
  if (!target) return;
  try {
    await mutateProfileStore(`${URL_PATH}?id=${encodeURIComponent(target.id)}`, {
      method: "DELETE",
    });
    await refresh();
  } catch {
    /* 삭제 실패는 무시 */
  }
}
