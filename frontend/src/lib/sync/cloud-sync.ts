/**
 * 프로필 계정 귀속 백업/복원 (클라이언트 사이드).
 *
 * 범위: 브랜드/AEO/제품 프로필 + 보관함(사용자 레코드). 비밀값(API키·네이버 비번)은 제외.
 * v1은 "백업/복원"이다(실시간 동기화 아님). 단일기기 last-writer-wins.
 *
 * 동작:
 *  - 로그인 시(syncOnLogin): 클라우드 행이 있으면 **복원만**(import skip — 기존 로컬 우선),
 *    없으면 현재 로컬을 1회 시드(비어있지 않을 때만). 로그인 자동 push는 하지 않는다
 *    → 오래된 로컬이 더 새로운 클라우드 백업을 덮어쓰는 사고 차단.
 *  - 사용자가 저장/삭제할 때(schedulePush): 디바운스 후 현재 로컬 스냅샷을 업로드.
 *
 * 안전장치: 로컬 목록 읽기가 하나라도 실패하면(손상/오류) push를 통째로 중단 →
 * 빈/부분 번들로 클라우드 백업을 덮어쓰지 않는다(로컬이 정본).
 *
 * 데스크톱은 service-role 키를 못 싣으므로 브라우저 supabase 클라이언트(사용자 JWT)로만
 * 접근하고, user_profile_sync 테이블 RLS가 본인 행만 허용한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStoreList } from "@/lib/store-fetch";
import type { BrandProfile, AnalysisRecord } from "@/types/brand";
import type { AeoProfile } from "@/types/aeo";
import type { UserProduct } from "@/types";

const TABLE = "user_profile_sync";
const BUNDLE_VERSION = 2;
const APP_NAME = "app_blog2";
const PUSH_DEBOUNCE_MS = 2500;

interface SyncBundle {
  version: number;
  exportedAt: string;
  appName: string;
  profiles: {
    brand: BrandProfile[];
    aeo: AeoProfile[];
    product: UserProduct[];
    analysis: AnalysisRecord[];
  };
}

interface Selection {
  brand: string[];
  aeo: string[];
  product: string[];
  analysis: string[];
}

// ─────────────────────────────────────────────
// 상태(설정 화면 표시용 — 침묵 실패 방지)
// ─────────────────────────────────────────────

export interface CloudSyncStatus {
  /** 마지막으로 백업(push/seed)에 성공한 시각 ISO. 한 번도 없으면 null. */
  lastBackupAt: string | null;
  /** 마지막 오류 메시지(테이블 미적용·오프라인 등). 정상이면 null. */
  lastError: string | null;
  /** 업로드 진행 중 여부. */
  pending: boolean;
}

let status: CloudSyncStatus = { lastBackupAt: null, lastError: null, pending: false };
const listeners = new Set<(s: CloudSyncStatus) => void>();

function setStatus(patch: Partial<CloudSyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((cb) => cb(status));
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return status;
}

export function subscribeCloudSyncStatus(cb: (s: CloudSyncStatus) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ─────────────────────────────────────────────
// 동기화 컨텍스트(싱글톤) — CloudSyncGate가 로그인 시 주입
// ─────────────────────────────────────────────

let ctx: { client: SupabaseClient; userId: string; appVersion?: string } | null = null;

export function setSyncContext(client: SupabaseClient, userId: string, appVersion?: string): void {
  ctx = { client, userId, appVersion };
}

export function clearSyncContext(): void {
  ctx = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

// ─────────────────────────────────────────────
// 번들 생성 / 선택
// ─────────────────────────────────────────────

/**
 * 현재 로컬 4종을 모아 v2 번들을 만든다.
 * 목록 fetch가 하나라도 실패하면 throw → 호출부(push/seed)가 업로드를 건너뛴다.
 * (손상/오류 시 빈 번들로 클라우드를 덮어쓰지 않기 위함)
 */
async function buildBundle(): Promise<{ bundle: SyncBundle; itemCount: number }> {
  const [brand, aeo, product, analysisAll] = await Promise.all([
    fetchStoreList<BrandProfile>("/api/brand/profiles"),
    fetchStoreList<AeoProfile>("/api/aeo/profiles"),
    fetchStoreList<UserProduct>("/api/products"),
    fetchStoreList<AnalysisRecord>("/api/analysis/records"),
  ]);
  // 보관함은 사용자 레코드만 (내장 템플릿은 로컬에서 자동 시드됨)
  const analysis = analysisAll.filter((r) => !r.isBuiltin);
  const bundle: SyncBundle = {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    profiles: { brand, aeo, product, analysis },
  };
  const itemCount = brand.length + aeo.length + product.length + analysis.length;
  return { bundle, itemCount };
}

function selectionFromBundle(b: SyncBundle): Selection {
  const p = b.profiles ?? ({} as SyncBundle["profiles"]);
  return {
    brand: (p.brand ?? []).map((x) => x.name).filter((v): v is string => typeof v === "string"),
    aeo: (p.aeo ?? []).map((x) => x.label).filter((v): v is string => typeof v === "string"),
    product: (p.product ?? []).map((x) => x.name).filter((v): v is string => typeof v === "string"),
    analysis: (p.analysis ?? []).map((x) => x.id).filter((v): v is string => typeof v === "string"),
  };
}

// ─────────────────────────────────────────────
// Push (사용자 저장 후 디바운스 업로드)
// ─────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function pushNow(): Promise<void> {
  if (!ctx) return;
  const { client, userId, appVersion } = ctx;
  setStatus({ pending: true });
  try {
    const { bundle } = await buildBundle(); // 로컬 읽기 실패 시 throw → 업로드 안 함
    const { error } = await client.from(TABLE).upsert({
      user_id: userId,
      bundle,
      app_version: appVersion ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    setStatus({ lastBackupAt: new Date().toISOString(), lastError: null, pending: false });
  } catch (e) {
    setStatus({ lastError: errMsg(e), pending: false });
  }
}

/** 사용자 저장/삭제 성공 후 호출. 디바운스로 묶어 1회 업로드. 컨텍스트 없으면 no-op. */
export function schedulePush(delayMs: number = PUSH_DEBOUNCE_MS): void {
  if (!ctx) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, delayMs);
}

/**
 * 대기 중인 디바운스 백업을 즉시 실행(앱 닫기/화면 전환 직전 등). 대기 없으면 no-op.
 * "저장 직후 바로 종료" 시 마지막 변경이 클라우드에 안 올라가는 창을 막는다.
 */
export async function flushPush(): Promise<void> {
  if (!pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  await pushNow();
}

// ─────────────────────────────────────────────
// 로그인 시 동기화 (복원 또는 시드)
// ─────────────────────────────────────────────

export interface LoginSyncResult {
  /** 클라우드에 이 계정의 백업 행이 이미 있었는가. */
  rowExists: boolean;
  /** 복원으로 실제 추가된 항목 수(0이면 변화 없음). */
  restoredCount: number;
}

/**
 * 로그인 직후 1회. 클라우드 행이 있으면 복원(skip)만, 없으면 시드.
 * 네트워크/테이블 오류 시 throw → 호출부(CloudSyncGate)가 backoff 재시도.
 */
export async function syncOnLogin(): Promise<LoginSyncResult> {
  if (!ctx) return { rowExists: false, restoredCount: 0 };
  const { client, userId } = ctx;

  const { data, error } = await client
    .from(TABLE)
    .select("bundle, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // 테이블 미적용/스키마캐시 지연/오프라인 — 상태에 노출(침묵 실패 방지) 후 재시도.
    setStatus({ lastError: error.message });
    throw new Error(error.message);
  }

  const cloudBundle = data?.bundle as SyncBundle | undefined;
  if (!cloudBundle || !cloudBundle.profiles) {
    // 클라우드 행 없음 → 현재 로컬을 1회 시드(비어있지 않을 때만)
    await seedIfAbsent();
    return { rowExists: false, restoredCount: 0 };
  }

  // 행 있음 → 복원만(import skip), push 하지 않음(클라우드 백업 보존).
  // "마지막 백업"은 클라우드 행의 최종 기록 시각으로 표시(복원만 한 세션도 백업 존재가 보이게).
  const restoredCount = await restoreFromBundle(cloudBundle);
  const updatedAt = typeof data?.updated_at === "string" ? data.updated_at : null;
  setStatus({ lastBackupAt: updatedAt, lastError: null });
  return { rowExists: true, restoredCount };
}

/**
 * 복원/시드 없이 "마지막 백업 시각"만 클라우드에서 가볍게 조회해 상태에 반영.
 * (복원 1회 가드가 걸린 이후 재진입/리로드 시 상태 표시를 위해 사용 — import·백업폴더 생성 없음)
 */
export async function refreshBackupStatus(): Promise<void> {
  if (!ctx) return;
  const { client, userId } = ctx;
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      setStatus({ lastError: error.message });
      return;
    }
    const updatedAt = typeof data?.updated_at === "string" ? data.updated_at : null;
    setStatus({ lastBackupAt: updatedAt, lastError: null });
  } catch (e) {
    setStatus({ lastError: errMsg(e) });
  }
}

async function seedIfAbsent(): Promise<void> {
  if (!ctx) return;
  const { client, userId, appVersion } = ctx;
  try {
    const { bundle, itemCount } = await buildBundle();
    if (itemCount === 0) return; // 올릴 게 없으면 빈 행을 만들지 않음
    const { error } = await client.from(TABLE).upsert({
      user_id: userId,
      bundle,
      app_version: appVersion ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    setStatus({ lastBackupAt: new Date().toISOString(), lastError: null });
  } catch (e) {
    setStatus({ lastError: errMsg(e) });
  }
}

/** 클라우드 번들을 기존 /import 엔드포인트(conflictPolicy=skip)로 복원. 추가된 개수 반환. */
async function restoreFromBundle(bundle: SyncBundle): Promise<number> {
  const selection = selectionFromBundle(bundle);
  const total =
    selection.brand.length +
    selection.aeo.length +
    selection.product.length +
    selection.analysis.length;
  if (total === 0) return 0;

  const res = await fetch("/api/profile-bundle/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundle, selection, conflictPolicy: "skip" }),
  });
  const dataRaw: unknown = await res.json().catch(() => ({}));
  const data = (dataRaw ?? {}) as Record<string, { added?: number } | undefined> & { error?: string };
  if (!res.ok) throw new Error(data.error || "백업 복원에 실패했습니다.");

  return (["brand", "aeo", "product", "analysis"] as const).reduce(
    (sum, k) => sum + (data[k]?.added ?? 0),
    0,
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
