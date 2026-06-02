/**
 * 완성 이미지 영속 저장 (IndexedDB).
 *
 * - 슬롯 도착 즉시 saveImage 호출 → 새로고침/재시작에도 보존
 * - localStorage는 도메인당 5~10MB 한도라 슬롯 10장(≈14MB)에 부족 → IndexedDB 사용
 * - 마지막 N개 라운드만 유지 (clearOldRounds)
 */

const DB_NAME = "app_blog2_images";
// v2: 보관함(드래프트) 전용 store 2개 추가 — round 자동정리(clearOldRounds)와 분리되어
// 사용자가 직접 지우기 전까지 보존된다.
const DB_VERSION = 2;
const STORE = "round_slots";
const DRAFT_SLOTS = "draft_slots"; // 완성 이미지: `${draftId}::${slotId}`
const DRAFT_USERPHOTOS = "draft_userphotos"; // 원본 사진: `${draftId}::${slotId}`

interface StoredImage {
  key: string; // `${roundId}::${slotId}`
  roundId: string;
  slotId: string;
  base64: string;
  mimeType: string;
  savedAt: number;
}

interface StoredDraftImage {
  key: string; // `${draftId}::${slotId}`
  draftId: string;
  slotId: string;
  base64: string;
  mimeType: string;
  savedAt: number;
}

interface StoredDraftUserPhoto {
  key: string; // `${draftId}::${slotId}`
  draftId: string;
  slotId: string;
  base64: string;
  mimeType: string;
  instruction: string;
  useProModel?: boolean;
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
      // 기존 store (v1) — 보존
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("by_round", "roundId", { unique: false });
        store.createIndex("by_savedAt", "savedAt", { unique: false });
      }
      // v2: 보관함 완성 이미지
      if (!db.objectStoreNames.contains(DRAFT_SLOTS)) {
        const ds = db.createObjectStore(DRAFT_SLOTS, { keyPath: "key" });
        ds.createIndex("by_draft", "draftId", { unique: false });
      }
      // v2: 보관함 원본 사진
      if (!db.objectStoreNames.contains(DRAFT_USERPHOTOS)) {
        const du = db.createObjectStore(DRAFT_USERPHOTOS, { keyPath: "key" });
        du.createIndex("by_draft", "draftId", { unique: false });
      }
    };
    // 다른 탭/연결이 옛 버전을 잡고 있어 업그레이드가 막힌 경우
    req.onblocked = () => {
      console.warn("[image-storage] DB 업그레이드가 다른 연결에 의해 막힘(onblocked)");
    };
    req.onsuccess = () => {
      const db = req.result;
      // 이후 다른 곳에서 버전을 또 올리려 하면 이 연결을 닫아 블록을 방지
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
  storeName: string = STORE
): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
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

// ─────────────────────────────────────────────────────────────────────────────
// 보관함(드래프트) 자산 — round 자동정리와 분리된 별도 store.
// 저장 시 현재 generatedImages / userPhotosBySlot 를 통째로 복사해 둔다.
// ─────────────────────────────────────────────────────────────────────────────

/** 완성 이미지(slotId → {base64, mimeType})를 드래프트에 복사 저장 */
export async function saveDraftImages(
  draftId: string,
  images: Record<string, { base64: string; mimeType: string }>
): Promise<void> {
  if (!isBrowser()) return;
  const entries = Object.entries(images);
  if (entries.length === 0) return;
  try {
    await withStore(
      "readwrite",
      (store) => {
        for (const [slotId, v] of entries) {
          const rec: StoredDraftImage = {
            key: `${draftId}::${slotId}`,
            draftId,
            slotId,
            base64: v.base64,
            mimeType: v.mimeType,
            savedAt: Date.now(),
          };
          store.put(rec);
        }
      },
      DRAFT_SLOTS
    );
  } catch (e) {
    console.warn("[image-storage] saveDraftImages 실패", e);
  }
}

/** 드래프트의 완성 이미지 로드 (slotId → {base64, mimeType}) */
export async function loadDraftImages(
  draftId: string
): Promise<Record<string, { base64: string; mimeType: string }>> {
  if (!isBrowser()) return {};
  try {
    return await withStore(
      "readonly",
      (store) => {
        return new Promise<Record<string, { base64: string; mimeType: string }>>(
          (resolve, reject) => {
            const out: Record<string, { base64: string; mimeType: string }> = {};
            const idx = store.index("by_draft");
            const req = idx.openCursor(IDBKeyRange.only(draftId));
            req.onsuccess = () => {
              const cur = req.result;
              if (!cur) {
                resolve(out);
                return;
              }
              const v = cur.value as StoredDraftImage;
              out[v.slotId] = { base64: v.base64, mimeType: v.mimeType };
              cur.continue();
            };
            req.onerror = () => reject(req.error);
          }
        );
      },
      DRAFT_SLOTS
    );
  } catch (e) {
    console.warn("[image-storage] loadDraftImages 실패", e);
    return {};
  }
}

export interface DraftUserPhoto {
  base64: string;
  mimeType: string;
  instruction: string;
  useProModel?: boolean;
}

/** 원본 사진(slotId → UserPhoto)을 드래프트에 복사 저장 */
export async function saveDraftUserPhotos(
  draftId: string,
  photos: Record<string, DraftUserPhoto>
): Promise<void> {
  if (!isBrowser()) return;
  const entries = Object.entries(photos);
  if (entries.length === 0) return;
  try {
    await withStore(
      "readwrite",
      (store) => {
        for (const [slotId, p] of entries) {
          const rec: StoredDraftUserPhoto = {
            key: `${draftId}::${slotId}`,
            draftId,
            slotId,
            base64: p.base64,
            mimeType: p.mimeType,
            instruction: p.instruction,
            useProModel: p.useProModel,
            savedAt: Date.now(),
          };
          store.put(rec);
        }
      },
      DRAFT_USERPHOTOS
    );
  } catch (e) {
    console.warn("[image-storage] saveDraftUserPhotos 실패", e);
  }
}

/** 드래프트의 원본 사진 로드 (slotId → UserPhoto) */
export async function loadDraftUserPhotos(
  draftId: string
): Promise<Record<string, DraftUserPhoto>> {
  if (!isBrowser()) return {};
  try {
    return await withStore(
      "readonly",
      (store) => {
        return new Promise<Record<string, DraftUserPhoto>>((resolve, reject) => {
          const out: Record<string, DraftUserPhoto> = {};
          const idx = store.index("by_draft");
          const req = idx.openCursor(IDBKeyRange.only(draftId));
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) {
              resolve(out);
              return;
            }
            const v = cur.value as StoredDraftUserPhoto;
            out[v.slotId] = {
              base64: v.base64,
              mimeType: v.mimeType,
              instruction: v.instruction,
              useProModel: v.useProModel,
            };
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        });
      },
      DRAFT_USERPHOTOS
    );
  } catch (e) {
    console.warn("[image-storage] loadDraftUserPhotos 실패", e);
    return {};
  }
}

/** 드래프트 삭제 시 완성 이미지 + 원본 사진을 함께 정리 */
export async function deleteDraftAssets(draftId: string): Promise<void> {
  if (!isBrowser()) return;
  const purge = async (storeName: string): Promise<void> => {
    await withStore(
      "readwrite",
      (store) => {
        return new Promise<void>((resolve, reject) => {
          const idx = store.index("by_draft");
          const req = idx.openCursor(IDBKeyRange.only(draftId));
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) {
              resolve();
              return;
            }
            cur.delete();
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        });
      },
      storeName
    );
  };
  try {
    await purge(DRAFT_SLOTS);
    await purge(DRAFT_USERPHOTOS);
  } catch (e) {
    console.warn("[image-storage] deleteDraftAssets 실패", e);
  }
}
