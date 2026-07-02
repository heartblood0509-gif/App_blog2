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
} from "@/lib/sync/cloud-sync";
import {
  setEngineContext,
  clearEngineContext,
  setRealtimeToken,
  reconcileAll,
  subscribeItemsRealtime,
  emitProfilesChanged,
} from "@/lib/sync/profile-sync-engine";

/** 데스크톱(Electron) 판정 — 웹(브라우저)에서는 실시간 동기화를 열지 않는다. */
function isDesktop(): boolean {
  return typeof window !== "undefined" && Boolean((window as { electronAPI?: unknown }).electronAPI);
}

export function CloudSyncGate() {
  const { supabase, session, deviceInfo } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const appVersion = deviceInfo?.app_version ?? undefined;
  const deviceId = deviceInfo?.device_id ?? undefined;

  // (a) 컨텍스트 주입 — 세션/토큰 갱신마다 최신화. 동기화 엔진(M2)은 데스크톱에서만 활성.
  useEffect(() => {
    if (supabase && userId) setSyncContext(supabase, userId, appVersion);
    if (supabase && userId && deviceId && isDesktop()) {
      setEngineContext(supabase, userId, deviceId);
    }
  }, [supabase, userId, appVersion, deviceId]);

  // (a2) realtime WS 인증 토큰 최신화(데스크톱만). postgres_changes 는 RLS 를 타므로
  //      WS 가 사용자 JWT 를 실어야 본인 행 이벤트가 온다. 로그인·토큰갱신마다 갱신하고,
  //      구독(e) 은 currentAccessToken 을 읽으므로 이 훅이 먼저 채워두는 게 중요.
  useEffect(() => {
    if (!isDesktop()) return;
    setRealtimeToken(session?.access_token ?? null);
  }, [session?.access_token]);

  // (b) 정리는 진짜 언마운트(로그아웃/종료) 시에만.
  useEffect(
    () => () => {
      clearSyncContext();
      clearEngineContext();
    },
    [],
  );

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

  // (d) 로그인 시 — 구버전 번들 1회 브리지 복원 + user_profiles 합집합/양방향 reconcile. 데스크톱만.
  //     userId 기준(토큰 갱신으로 session 객체만 바뀌어도 재실행 안 함).
  useEffect(() => {
    if (!supabase || !userId || !isDesktop()) return;
    const bridgeGuard = `cloud-sync:bridged:${userId}`;
    let cancelled = false;
    let attempt = 0;

    const run = async () => {
      if (cancelled) return;
      try {
        // 구버전(user_profile_sync) 번들을 로컬로 1회 흡수(add-only) → 이후 reconcile 이 항목단위로 이관.
        if (window.sessionStorage.getItem(bridgeGuard) !== "1") {
          await syncOnLogin();
          window.sessionStorage.setItem(bridgeGuard, "1");
        }
        // 로컬↔user_profiles 양방향 정합(idempotent — 재연결 catch-up 겸용).
        await reconcileAll();
        if (!cancelled) emitProfilesChanged("all");
      } catch {
        if (cancelled) return;
        attempt += 1;
        if (attempt <= 3) {
          // 백엔드 미준비/네트워크 지연 — 짧은 backoff 재시도.
          window.setTimeout(() => void run(), 1500 * attempt);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  // (e) Realtime 구독 — 다른 기기의 항목 변경을 사용 중 실시간 반영. 데스크톱에서만.
  //     userId 기준(토큰 갱신으로 session 객체만 바뀌어도 재구독 안 함).
  useEffect(() => {
    if (!supabase || !userId || !isDesktop()) return;
    const unsubscribe = subscribeItemsRealtime(supabase, userId);
    return unsubscribe;
  }, [supabase, userId]);

  return null;
}
