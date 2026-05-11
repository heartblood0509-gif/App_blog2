"use client";

// §D — 작업 진행 중에는 자동 업데이트 설치를 차단한다.
//
// 사용 예:
//   useBusy("publish:auto", isPublishing);
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

/** 비-React 컨텍스트(예: imperative async 함수)에서 직접 호출하고 싶을 때. */
export const busyApi = {
  start(opId: string): void {
    getApi()?.startBusy(opId).catch(() => { /* ignore */ });
  },
  end(opId: string): void {
    getApi()?.endBusy(opId).catch(() => { /* ignore */ });
  },
};
