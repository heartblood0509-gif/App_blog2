/**
 * 완성 이미지 영속 저장 (IndexedDB).
 *
 * - 슬롯 도착 즉시 saveImage 호출 → 새로고침/재시작에도 보존
 * - localStorage는 도메인당 5~10MB 한도라 슬롯 10장(≈14MB)에 부족 → IndexedDB 사용
 * - 마지막 N개 라운드만 유지 (clearOldRounds)
 */

const DB_NAME = "app_blog2_images";
const DB_VERSION = 1;
const STORE = "round_slots";

interface StoredImage {
  key: string; // `${roundId}::${slotId}`
  roundId: string;
  slotId: string;
  base64: string;
  mimeType: string;
  savedAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("by_round", "roundId", { unique: false });
        store.createIndex("by_savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result: T;
      Promise.resolve(fn(store))
        .then((v) => {
          result = v;
        })
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveImage(
  roundId: string,
  slotId: string,
  base64: string,
  mimeType: string
): Promise<void> {
  if (!isBrowser()) return;
  try {
    await withStore("readwrite", (store) => {
      const rec: StoredImage = {
        key: `${roundId}::${slotId}`,
        roundId,
        slotId,
        base64,
        mimeType,
        savedAt: Date.now(),
      };
      store.put(rec);
    });
  } catch (e) {
    console.warn("[image-storage] saveImage 실패", e);
  }
}

export async function loadImagesByRound(
  roundId: string
): Promise<Record<string, { base64: string; mimeType: string }>> {
  if (!isBrowser()) return {};
  try {
    return await withStore("readonly", (store) => {
      return new Promise<Record<string, { base64: string; mimeType: string }>>(
        (resolve, reject) => {
          const out: Record<string, { base64: string; mimeType: string }> = {};
          const idx = store.index("by_round");
          const req = idx.openCursor(IDBKeyRange.only(roundId));
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) {
              resolve(out);
              return;
            }
            const v = cur.value as StoredImage;
            out[v.slotId] = { base64: v.base64, mimeType: v.mimeType };
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        }
      );
    });
  } catch (e) {
    console.warn("[image-storage] loadImagesByRound 실패", e);
    return {};
  }
}

export async function listRoundIds(): Promise<string[]> {
  if (!isBrowser()) return [];
  try {
    return await withStore("readonly", (store) => {
      return new Promise<string[]>((resolve, reject) => {
        const seen = new Map<string, number>();
        const req = store.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) {
            // 가장 최근 savedAt 기준 내림차순
            const sorted = [...seen.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([rid]) => rid);
            resolve(sorted);
            return;
          }
          const v = cur.value as StoredImage;
          const prev = seen.get(v.roundId) ?? 0;
          if (v.savedAt > prev) seen.set(v.roundId, v.savedAt);
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
    });
  } catch (e) {
    console.warn("[image-storage] listRoundIds 실패", e);
    return [];
  }
}

export async function clearOldRounds(keepLast: number = 3): Promise<void> {
  if (!isBrowser()) return;
  try {
    const rounds = await listRoundIds();
    const drop = rounds.slice(keepLast);
    if (drop.length === 0) return;
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        let pending = drop.length;
        if (pending === 0) {
          resolve();
          return;
        }
        for (const rid of drop) {
          const idx = store.index("by_round");
          const req = idx.openCursor(IDBKeyRange.only(rid));
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) {
              pending--;
              if (pending === 0) resolve();
              return;
            }
            cur.delete();
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        }
      });
    });
  } catch (e) {
    console.warn("[image-storage] clearOldRounds 실패", e);
  }
}
