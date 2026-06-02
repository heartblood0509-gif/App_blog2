/**
 * 보관함(드래프트) 메타데이터를 localStorage 에 보관.
 *
 * - 글자/구조 스냅샷만 여기에 저장(가벼움). 이미지·원본사진 base64 는 IndexedDB(image-storage)에.
 * - 덮어쓰기는 id 기준만 — 이름 기준 덮어쓰기는 자동 제목 충돌 위험이 있어 금지.
 * - 최신 수정순(updatedAt desc)으로 정렬해 반환.
 *
 * SSR 안전: 모든 함수는 typeof window === "undefined" 가드를 거침.
 */

import type { BlogDraft } from "@/types";

const STORAGE_KEY = "blogpick-drafts";

function readAll(): BlogDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as BlogDraft[];
  } catch {
    return [];
  }
}

function writeAll(drafts: BlogDraft[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  emitChange();
}

// ─────────────────────────────────────────────────────────────────────────────
// useSyncExternalStore 용 외부 스토어 — 컴포넌트가 마운트 이펙트에서 setState 하지 않고
// localStorage 보관함을 안전하게 구독한다(SSR 시 빈 배열). 변경 시 캐시 무효화 + 알림.
// ─────────────────────────────────────────────────────────────────────────────
const listeners = new Set<() => void>();
let cachedSnapshot: BlogDraft[] | null = null;
const EMPTY: BlogDraft[] = [];

function emitChange(): void {
  cachedSnapshot = null; // 다음 getSnapshot 에서 재계산
  for (const l of listeners) l();
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 안정 참조 스냅샷 — 변경 전까지 동일 배열을 반환(useSyncExternalStore 요구사항). */
export function getDraftsSnapshot(): BlogDraft[] {
  if (cachedSnapshot === null) cachedSnapshot = listDrafts();
  return cachedSnapshot;
}

/** SSR 스냅샷 — 서버에선 항상 빈 배열(동일 참조). */
export function getDraftsServerSnapshot(): BlogDraft[] {
  return EMPTY;
}

/** 최신 수정순으로 전체 목록 반환 */
export function listDrafts(): BlogDraft[] {
  return readAll().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getDraft(id: string): BlogDraft | null {
  return readAll().find((d) => d.id === id) ?? null;
}

/**
 * 새 드래프트 저장. id 를 넘기면 해당 항목을 덮어쓰기(업데이트), 없으면 새로 생성.
 * 저장 실패(quota 등)는 호출 측에서 처리하도록 예외를 던진다.
 */
export function saveDraft(
  input: Omit<BlogDraft, "id" | "createdAt" | "updatedAt"> & { id?: string },
): BlogDraft {
  const all = readAll();
  const now = new Date().toISOString();

  if (input.id) {
    const idx = all.findIndex((d) => d.id === input.id);
    if (idx >= 0) {
      const updated: BlogDraft = {
        ...all[idx],
        name: input.name,
        memo: input.memo,
        snapshot: input.snapshot,
        slotIds: input.slotIds,
        userPhotoSlotIds: input.userPhotoSlotIds,
        updatedAt: now,
      };
      all[idx] = updated;
      writeAll(all);
      return updated;
    }
  }

  const created: BlogDraft = {
    id: input.id ?? `draft-${Date.now()}`,
    name: input.name,
    memo: input.memo,
    snapshot: input.snapshot,
    slotIds: input.slotIds,
    userPhotoSlotIds: input.userPhotoSlotIds,
    createdAt: now,
    updatedAt: now,
  };
  all.push(created);
  writeAll(all);
  return created;
}

export function renameDraft(id: string, name: string, memo?: string): BlogDraft | null {
  const all = readAll();
  const target = all.find((d) => d.id === id);
  if (!target) return null;
  target.name = name;
  if (memo !== undefined) target.memo = memo;
  target.updatedAt = new Date().toISOString();
  writeAll(all);
  return target;
}

/** 메타만 삭제 — IndexedDB 자산(deleteDraftAssets)은 호출 측에서 함께 정리 */
export function deleteDraft(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
}

// ─────────────────────────────────────────────────────────────────────────────
// "내 정보 → 글 보관함"에서 이어하기 시, 메인('/')으로 이동하며 복원할 드래프트 id 를
// 잠깐 남겨두는 쪽지. 메인 페이지가 마운트될 때 consume 해서 자동 복원한다.
// ─────────────────────────────────────────────────────────────────────────────
const PENDING_KEY = "blogpick-pending-draft";

export function setPendingDraft(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_KEY, id);
  } catch {
    // 무시
  }
}

/** 대기 중인 draftId 를 읽고 즉시 제거(1회성). 없으면 null. */
export function consumePendingDraft(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(PENDING_KEY);
    if (id) localStorage.removeItem(PENDING_KEY);
    return id;
  } catch {
    return null;
  }
}
