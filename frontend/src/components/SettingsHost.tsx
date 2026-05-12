"use client";

// §F — SettingsModal 의 mount 관리.
// 첫 부팅 시 key 가 없으면 자동 표시 + 닫기 불가.

import { useEffect, useState } from "react";
import { SettingsModal } from "./SettingsModal";

export function SettingsHost() {
  const [open, setOpen] = useState(false);
  const [forceFirstRun, setForceFirstRun] = useState(false);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI?.settings : undefined;
    if (!api) return;
    api.getMasked().then((r) => {
      if (!r.hasKey) {
        setOpen(true);
        setForceFirstRun(true);
      }
    });
  }, []);

  return <SettingsModal open={open} onOpenChange={setOpen} forceFirstRun={forceFirstRun} />;
}
