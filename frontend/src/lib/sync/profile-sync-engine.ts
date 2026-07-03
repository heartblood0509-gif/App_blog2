/**
 * 프로필 실시간 동기화 엔진 (M2).
 *
 * 항목단위 클라우드 테이블 `user_profiles` 와 로컬 백엔드(4종)를 스냅샷 기반으로
 * 양방향 reconcile 한다. 생성·수정·삭제가 모두 전파되고, 삭제는 tombstone(deleted_at)
 * 으로 표현한다. 기기 공통 식별자는 레코드의 `uuid`(로컬 id 인 brandN 과 별개).
 *
 * 핵심 아이디어 — "마지막으로 동기화된 스냅샷"(uuid→contentHash)을 로컬에 보관해,
 * reconcile 시 다음을 구분한다:
 *   · 로컬에 있는데 스냅샷과 내용이 다름   → 로컬이 수정됨 → 클라우드로 push
 *   · 스냅샷엔 있는데 로컬에 없음          → 로컬에서 삭제됨 → 클라우드에 tombstone
 *   · 클라우드에 있는데 로컬에 없음(신규)  → 다른 기기가 만듦 → 로컬로 pull(생성)
 *   · 클라우드가 tombstone                → 다른 기기가 삭제 → 로컬에서 삭제
 * reconcile 은 idempotent — 같은 상태를 여러 번 돌려도 안전(그래서 echo·재연결 catch-up
 * 을 별도 로직 없이 흡수한다). 원격 적용은 순수 fetch 로 쓰므로 mutateProfileStore →
 * push 를 다시 태우지 않는다(echo 방지).
 *
 * LWW: 동일 항목 동시 편집은 클라우드 행 updated_at(DB 트리거가 서버시계로 스탬프)이
 * 사실상 "마지막 쓴 쪽"이 이긴다. 로컬 편집 여부는 스냅샷 대조로 판정한다.
 *
 * 범위: 데스크톱 전용(웹/KV 경로는 이 엔진을 쓰지 않는다).
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { fetchStoreList } from "@/lib/store-fetch";
import { reportSyncStatus } from "@/lib/sync/cloud-sync";

export type ProfileKind = "brand" | "aeo" | "product" | "analysis" | "saved-color";

const KINDS: ProfileKind[] = ["brand", "aeo", "product", "analysis", "saved-color"];
const TABLE = "user_profiles";
const RECONCILE_DEBOUNCE_MS = 1200;

const LIST_URL: Record<ProfileKind, string> = {
  brand: "/api/brand/profiles",
  aeo: "/api/aeo/profiles",
  product: "/api/products",
  analysis: "/api/analysis/records",
  "saved-color": "/api/saved-colors",
};

/** 종류별 자연키 필드(사람이 읽는 고유 이름). analysis 는 내용해시로 판정하므로 없음.
 * saved-color 는 hex 가 자연키지만, uuid 를 hex 로부터 결정론적으로 만들어(백엔드 uuid5)
 * 같은 색이면 어느 기기든 동일 uuid → item_uuid 기준 자동 병합되므로 rename 로직이 불필요.
 * (null 로 두어 "같은 이름 → 둘 다 보존 후 rename" 경로를 타지 않게 한다 — 색엔 부적절.) */
const NAME_FIELD: Record<ProfileKind, string | null> = {
  brand: "name",
  aeo: "label",
  product: "name",
  analysis: null,
  "saved-color": null,
};

// 로컬 id·동기화 메타 등 "내용"이 아닌 필드 — contentHash 계산에서 제외.
const VOLATILE_KEYS = new Set(["id", "uuid", "updatedAt", "isBuiltin", "createdAt"]);

type Rec = Record<string, unknown>;
interface CloudRow {
  item_uuid: string;
  payload: Rec;
  deleted_at: string | null;
  updated_at: string;
}

// ─────────────────────────────────────────────
// echo 억제 플래그 (원격 적용 중 push 트리거 차단)
// ─────────────────────────────────────────────

let applyingRemote = false;
export function isApplyingRemote(): boolean {
  return applyingRemote;
}
export function beginApplyRemote(): void {
  applyingRemote = true;
}
export function endApplyRemote(): void {
  applyingRemote = false;
}

// ─────────────────────────────────────────────
// 레코드 변경 버스 — 원격 변경이 로컬에 반영되면 kind(또는 "all")로 방송.
// ─────────────────────────────────────────────

type ChangeListener = (kind: ProfileKind | "all") => void;
const changeListeners = new Set<ChangeListener>();

export function subscribeProfilesChanged(cb: ChangeListener): () => void {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}
export function emitProfilesChanged(kind: ProfileKind | "all"): void {
  changeListeners.forEach((cb) => cb(kind));
}

// ─────────────────────────────────────────────
// 엔진 컨텍스트 — CloudSyncGate 가 로그인 시 주입
// ─────────────────────────────────────────────

interface EngineCtx {
  client: SupabaseClient;
  userId: string;
  deviceId: string;
}
let ctx: EngineCtx | null = null;

// realtime WebSocket 에 실을 사용자 JWT. postgres_changes 는 RLS 를 타므로 이 토큰이 없으면
// (익명 WS) 본인 행 이벤트가 조용히 안 온다. CloudSyncGate 가 로그인/토큰갱신마다 주입.
let currentAccessToken: string | null = null;

export function setEngineContext(client: SupabaseClient, userId: string, deviceId: string): void {
  ctx = { client, userId, deviceId };
}
export function clearEngineContext(): void {
  ctx = null;
  currentAccessToken = null;
  for (const k of KINDS) {
    const t = reconcileTimers[k];
    if (t) {
      clearTimeout(t);
      reconcileTimers[k] = null;
    }
  }
}

/**
 * realtime WS 인증 토큰 갱신. 로그인·토큰갱신마다 CloudSyncGate 가 호출한다.
 * ctx 가 있으면 즉시 client.realtime.setAuth 로 살아있는 소켓에도 반영(재구독 불필요).
 */
export function setRealtimeToken(token: string | null): void {
  currentAccessToken = token;
  if (ctx) void ctx.client.realtime.setAuth(token ?? undefined);
}

// ─────────────────────────────────────────────
// 순수 유틸 — 내용 해시 / 자연키 / URL→kind
// ─────────────────────────────────────────────

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Rec;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function contentString(r: Rec): string {
  const out: Rec = {};
  for (const k of Object.keys(r)) {
    if (!VOLATILE_KEYS.has(k)) out[k] = r[k];
  }
  return stableStringify(out);
}

async function contentHash(r: Rec): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contentString(r)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nameOf(kind: ProfileKind, r: Rec): string {
  const f = NAME_FIELD[kind];
  return f ? String(r[f] ?? "") : "";
}

/** 이름 충돌 시 " (2)", " (3)" … 로 로컬 고유 이름 생성. */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/** 쓰기 URL 에서 kind 판별 (mutateProfileStore 에서 사용). */
export function kindFromUrl(input: RequestInfo | URL): ProfileKind | null {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url ?? "";
  if (url.includes("/api/brand/profiles")) return "brand";
  if (url.includes("/api/aeo/profiles")) return "aeo";
  if (url.includes("/api/saved-colors")) return "saved-color";
  if (url.includes("/api/products")) return "product";
  if (url.includes("/api/analysis/records")) return "analysis";
  return null;
}

// ─────────────────────────────────────────────
// 스냅샷(로컬 persist) — uuid → 마지막 동기화된 contentHash
// ─────────────────────────────────────────────

type KindSnap = Record<string, string>;
type Snapshot = Partial<Record<ProfileKind, KindSnap>>;

function snapStorageKey(userId: string): string {
  return `profile-sync:snap:${userId}`;
}
function loadSnapshot(userId: string): Snapshot {
  try {
    const raw = window.localStorage.getItem(snapStorageKey(userId));
    if (raw) return JSON.parse(raw) as Snapshot;
  } catch {
    /* 손상 시 빈 스냅샷 — 다음 reconcile 이 add-only 로 재구성(오삭제 없음) */
  }
  return {};
}
function saveSnapshot(userId: string, snap: Snapshot): void {
  try {
    window.localStorage.setItem(snapStorageKey(userId), JSON.stringify(snap));
  } catch {
    /* 저장 실패는 다음 reconcile 에서 복구 */
  }
}

// ─────────────────────────────────────────────
// 로컬/클라우드 IO — 원격 적용은 순수 fetch(=push 재유발 안 함)
// ─────────────────────────────────────────────

async function fetchLocal(kind: ProfileKind): Promise<Rec[]> {
  const list = await fetchStoreList<Rec>(LIST_URL[kind]);
  // 보관함 내장 템플릿은 동기화 대상 아님.
  if (kind === "analysis") {
    return list.filter((r) => !r.isBuiltin && r.sourceType !== "builtin");
  }
  return list;
}

async function localCreate(kind: ProfileKind, payload: Rec): Promise<void> {
  await fetch(LIST_URL[kind], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
async function localUpdate(kind: ProfileKind, localId: string, payload: Rec): Promise<void> {
  await fetch(`${LIST_URL[kind]}?id=${encodeURIComponent(localId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
async function localDelete(kind: ProfileKind, localId: string): Promise<void> {
  await fetch(`${LIST_URL[kind]}?id=${encodeURIComponent(localId)}`, { method: "DELETE" });
}

/** 클라우드로 올릴 payload — 로컬 id 제거(기기마다 다름). uuid/updatedAt 등은 유지. */
function toPayload(r: Rec): Rec {
  const out: Rec = {};
  for (const k of Object.keys(r)) {
    if (k !== "id") out[k] = r[k];
  }
  return out;
}

async function fetchCloud(kind: ProfileKind): Promise<CloudRow[]> {
  if (!ctx) return [];
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("item_uuid, payload, deleted_at, updated_at")
    .eq("user_id", ctx.userId)
    .eq("kind", kind);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CloudRow[];
}

async function cloudUpsert(kind: ProfileKind, itemUuid: string, payload: Rec, deleted: boolean): Promise<void> {
  if (!ctx) return;
  const { error } = await ctx.client.from(TABLE).upsert({
    user_id: ctx.userId,
    kind,
    item_uuid: itemUuid,
    payload,
    deleted_at: deleted ? new Date().toISOString() : null,
    source_device: ctx.deviceId,
    // updated_at 은 DB 트리거가 서버시계로 스탬프(LWW 기준).
  });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// reconcile — 한 kind 의 로컬↔클라우드를 스냅샷 기준으로 맞춘다.
// ─────────────────────────────────────────────

const running: Partial<Record<ProfileKind, boolean>> = {};
const rerun: Partial<Record<ProfileKind, boolean>> = {};

async function reconcileKind(kind: ProfileKind): Promise<void> {
  if (!ctx) return;
  if (running[kind]) {
    rerun[kind] = true; // 진행 중이면 끝나고 한 번 더
    return;
  }
  running[kind] = true;
  const { userId } = ctx;
  let changedLocal = false;
  beginApplyRemote(); // 로컬 쓰기 중 push 재유발 차단
  try {
    const local = await fetchLocal(kind); // 손상 시 StoreCorruptError → 아래 catch 로 중단(덮어쓰기 방지)
    const cloud = await fetchCloud(kind);
    const snap = loadSnapshot(userId);
    const kindSnap: KindSnap = { ...(snap[kind] ?? {}) };

    const cloudByUuid = new Map<string, CloudRow>();
    for (const c of cloud) cloudByUuid.set(c.item_uuid, c);

    // (A) 로컬 uuid backfill — 없으면 내용 동일한 클라우드 행의 uuid 채택, 아니면 신규 발급 후 persist.
    for (const r of local) {
      if (typeof r.uuid === "string" && r.uuid) continue;
      const ch = await contentHash(r);
      let adopt: string | null = null;
      for (const c of cloud) {
        if (c.deleted_at) continue;
        if ((await contentHash(c.payload)) === ch) {
          adopt = c.item_uuid;
          break;
        }
      }
      r.uuid = adopt ?? crypto.randomUUID();
      await localUpdate(kind, String(r.id), toPayload(r)); // uuid 저장(내용 동일 → UI 영향 없음)
    }

    const localUuids = new Set(local.map((r) => String(r.uuid)));
    const handled = new Set<string>(); // 이번 run 에서 처리한 클라우드 uuid
    const tombstoned = new Set<string>();

    // (B) 로컬 각 항목 처리 — push / pull-update / 원격삭제 반영.
    for (const r of local) {
      const uuid = String(r.uuid);
      handled.add(uuid);
      const ch = await contentHash(r);
      const c = cloudByUuid.get(uuid);

      if (!c) {
        // 클라우드에 없음 → 신규 push
        await cloudUpsert(kind, uuid, toPayload(r), false);
        kindSnap[uuid] = ch;
      } else if (c.deleted_at) {
        // 원격 tombstone
        if (kindSnap[uuid] === ch) {
          // 로컬 미변경 → 원격 삭제 수용
          await localDelete(kind, String(r.id));
          delete kindSnap[uuid];
          localUuids.delete(uuid);
          changedLocal = true;
        } else {
          // 로컬이 삭제 이후 수정됨 → 부활(로컬 우선 push)
          await cloudUpsert(kind, uuid, toPayload(r), false);
          kindSnap[uuid] = ch;
        }
      } else {
        const cch = await contentHash(c.payload);
        if (cch === ch) {
          kindSnap[uuid] = ch; // 이미 동기
        } else if (kindSnap[uuid] === ch) {
          // 로컬 미변경, 클라우드 변경 → pull
          await localUpdate(kind, String(r.id), c.payload);
          kindSnap[uuid] = cch;
          changedLocal = true;
        } else {
          // 로컬 변경(또는 양쪽 변경) → 로컬 우선 push
          await cloudUpsert(kind, uuid, toPayload(r), false);
          kindSnap[uuid] = ch;
        }
      }
    }

    // (C) 로컬에서 삭제된 항목(스냅샷엔 있는데 로컬에 없음) → 클라우드 tombstone.
    for (const uuid of Object.keys(kindSnap)) {
      if (localUuids.has(uuid)) continue;
      const c = cloudByUuid.get(uuid);
      if (c && !c.deleted_at) {
        await cloudUpsert(kind, uuid, c.payload, true);
        tombstoned.add(uuid);
      }
      delete kindSnap[uuid];
    }

    // (D) 클라우드에만 있는 활성 항목 → 로컬로 pull(생성). 이름 충돌 시 rename 후 양쪽 수렴.
    const localNames = new Set(local.map((r) => nameOf(kind, r)).filter((n) => n));
    for (const c of cloud) {
      if (c.deleted_at) continue;
      if (handled.has(c.item_uuid) || tombstoned.has(c.item_uuid)) continue;
      let payload: Rec = { ...c.payload, uuid: c.item_uuid };
      const nameField = NAME_FIELD[kind];
      if (nameField) {
        const nm = String(payload[nameField] ?? "");
        if (nm && localNames.has(nm)) {
          // 같은 이름의 다른 항목이 로컬에 존재 → 둘 다 보존: pull 쪽을 rename 후 클라우드에도 반영.
          const renamed = uniqueName(nm, localNames);
          payload = { ...payload, [nameField]: renamed };
          await cloudUpsert(kind, c.item_uuid, toPayload(payload), false);
        }
        localNames.add(String(payload[nameField] ?? ""));
      }
      await localCreate(kind, payload);
      kindSnap[c.item_uuid] = await contentHash(payload);
      changedLocal = true;
    }

    snap[kind] = kindSnap;
    saveSnapshot(userId, snap);
    reportSyncStatus({ lastBackupAt: new Date().toISOString(), lastError: null });
    if (changedLocal) emitProfilesChanged(kind);
  } catch (e) {
    reportSyncStatus({ lastError: e instanceof Error ? e.message : String(e) });
  } finally {
    endApplyRemote();
    running[kind] = false;
    if (rerun[kind]) {
      rerun[kind] = false;
      void reconcileKind(kind);
    }
  }
}

/** 모든 kind reconcile — 로그인 시 합집합/복원. */
export async function reconcileAll(): Promise<void> {
  for (const k of KINDS) {
    await reconcileKind(k);
  }
}

// ─────────────────────────────────────────────
// 디바운스 트리거 — 로컬 쓰기 / 원격 이벤트 공용
// ─────────────────────────────────────────────

const reconcileTimers: Record<ProfileKind, ReturnType<typeof setTimeout> | null> = {
  brand: null,
  aeo: null,
  product: null,
  analysis: null,
  "saved-color": null,
};

export function scheduleReconcile(kind: ProfileKind, delayMs: number = RECONCILE_DEBOUNCE_MS): void {
  if (!ctx) return;
  const t = reconcileTimers[kind];
  if (t) clearTimeout(t);
  reconcileTimers[kind] = setTimeout(() => {
    reconcileTimers[kind] = null;
    void reconcileKind(kind);
  }, delayMs);
}

// ─────────────────────────────────────────────
// Realtime 구독 — user_profiles 본인 행 변경 시 해당 kind reconcile
// ─────────────────────────────────────────────

export function subscribeItemsRealtime(client: SupabaseClient, userId: string): () => void {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const handleRow = (payload: { new?: unknown; old?: unknown }) => {
    const row = (payload.new ?? payload.old ?? {}) as { kind?: string; source_device?: string };
    // 자기 기기 write 가 되돌아온 것이면 무시(reconcile 이 idempotent 라 무해하지만 불필요).
    if (row.source_device && ctx && row.source_device === ctx.deviceId) return;
    const kind = row.kind as ProfileKind | undefined;
    if (kind && KINDS.includes(kind)) scheduleReconcile(kind);
  };

  const join = async () => {
    if (closed) return;
    // ⚠️ postgres_changes 는 RLS 를 타므로 WS 가 사용자 JWT 를 실어야 본인 행 이벤트가 온다.
    // 수동 세션(Electron/device auth) 환경에선 supabase-js 자동 배선이 불확실 → 명시적으로 세팅.
    try {
      await client.realtime.setAuth(currentAccessToken ?? undefined);
    } catch {
      /* setAuth 실패해도 아래 구독은 시도(다음 재시도에서 복구) */
    }
    if (closed) return;
    channel = client
      .channel(`profile-items:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${userId}` },
        handleRow,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          attempt = 0;
          reportSyncStatus({ lastError: null });
          // 구독 확립 시 놓친 변경 catch-up(최초 구독·재연결 공용, idempotent).
          void reconcileAll();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // 조용한 실패 방지 — 상태 노출 + 지수 backoff 재접속.
          if (closed) return;
          reportSyncStatus({ lastError: `실시간 동기화 연결 실패(${status})` });
          attempt += 1;
          const delay = Math.min(30_000, 1_000 * 2 ** attempt);
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            if (closed) return;
            const prev = channel;
            channel = null;
            if (prev) void client.removeChannel(prev);
            void join();
          }, delay);
        }
      });
  };

  void join();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (channel) void client.removeChannel(channel);
  };
}
