"use client";

// §D — 작업 진행 중에는 자동 업데이트 설치를 차단한다.
//
// 사용 예:
//   useBusy("publish:compose", isPublishing);
//   useBusy(`publish:manual:${manualSessionId}`, true);
//
// 첫 인자 = unique operation id (Set 에 들어가므로 중복 add 안전).
// 둘째 인자 = active flag. true 일 때만 startBusy, false 또는 cleanup 시 endBusy.

import { useEffect } from "react";

// 타입은 src/types/electron-api.d.ts 에서 ambient 로 선언됨.

function getApi() {
  if (typeof window === "undefined") return undefined;
  return window.electronAPI?.app;
}

function getPublishApi() {
  if (typeof window === "undefined") return undefined;
  return window.electronAPI?.publish;
}

export function useBusy(opId: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = getApi();
    if (!api) return;
    api.startBusy(opId).catch(() => { /* ignore */ });
    return () => {
      api.endBusy(opId).catch(() => { /* ignore */ });
    };
  }, [opId, active]);
}

/**
 * §H 발행 진행 상태 추적. busy 와 별개로 종료 모달 가드에 사용.
 * 같은 opId 를 useBusy 와 공유 가능 (양쪽 Set 에 독립적으로 들어감).
 */
export function usePublishing(opId: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = getPublishApi();
    if (!api) return;
    api.start(opId).catch(() => { /* ignore */ });
    return () => {
      api.end(opId).catch(() => { /* ignore */ });
    };
  }, [opId, active]);
}

/** 비-React 컨텍스트(예: imperative async 함수)에서 직접 호출하고 싶을 때. */
export const busyApi = {
  start(opId: string): void {
    getApi()?.startBusy(opId).catch(() => { /* ignore */ });
  },
  end(opId: string): void {
    getApi()?.endBusy(opId).catch(() => { /* ignore */ });
  },
};

export const publishingApi = {
  start(opId: string): void {
    getPublishApi()?.start(opId).catch(() => { /* ignore */ });
  },
  end(opId: string): void {
    getPublishApi()?.end(opId).catch(() => { /* ignore */ });
  },
};
