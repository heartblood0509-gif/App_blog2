"use client";

// 로그인(authorized) 직후 1회 — 클라우드 백업을 복원(있으면)하거나 현재 로컬을 시드(없으면).
// AuthSessionProvider 가 authorized 일 때만 children 을 렌더하므로, 이 컴포넌트도 그때만 마운트된다.
// authorize() 는 호출하지 않는다(게이트 unmount/wizard 리셋 회귀 방지) — supabase 직접 읽기/import 만.

import { useEffect } from "react";
import { useAuthSession } from "@/components/providers/AuthSessionProvider";
import {
  setSyncContext,
  clearSyncContext,
  syncOnLogin,
  flushPush,
  refreshBackupStatus,
} from "@/lib/sync/cloud-sync";

export function CloudSyncGate() {
  const { supabase, session, deviceInfo } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const appVersion = deviceInfo?.app_version ?? undefined;

  // (a) 백업 컨텍스트 주입 — 세션/토큰 갱신마다 최신화. 대기 중 push 타이머는 건드리지 않는다.
  useEffect(() => {
    if (supabase && userId) setSyncContext(supabase, userId, appVersion);
  }, [supabase, userId, appVersion]);

  // (b) 정리는 진짜 언마운트(로그아웃/종료) 시에만 — 토큰 갱신 때 대기 중 백업이 지워지지 않게.
  useEffect(() => () => clearSyncContext(), []);

  // (c) 화면이 가려질 때(앱 닫기·전환 직전) 대기 중 백업을 즉시 flush — "저장 직후 종료" 유실 방지.
  useEffect(() => {
    const onHide = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        void flushPush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // (d) 로그인 1회 복원/시드 — userId 기준(토큰 갱신으로 session 객체만 바뀌어도 재실행 안 함).
  useEffect(() => {
    if (!supabase || !userId) return;
    const guardKey = `cloud-sync:pulled:${userId}`;
    let cancelled = false;
    let attempt = 0;

    const run = async () => {
      if (cancelled) return;
      // 한 세션(앱 실행)당 1회만 복원. 성공 후에만 가드를 세운다(미준비/오프라인이면 재시도).
      // 이미 복원한 세션(리로드 등)에선 상태("마지막 백업")만 가볍게 갱신.
      if (typeof window !== "undefined" && window.sessionStorage.getItem(guardKey) === "1") {
        void refreshBackupStatus();
        return;
      }
      try {
        const r = await syncOnLogin();
        if (cancelled) return;
        window.sessionStorage.setItem(guardKey, "1");
        // 새 PC 복원으로 실제 항목이 들어왔으면 화면 전체를 최신 데이터로 1회 리로드.
        if (r.rowExists && r.restoredCount > 0) {
          window.location.reload();
        }
      } catch {
        if (cancelled) return;
        attempt += 1;
        if (attempt <= 3) {
          // 백엔드 미준비/네트워크 지연 — 짧은 backoff 재시도(가드 미설정 상태 유지).
          window.setTimeout(() => void run(), 1500 * attempt);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  return null;
}
