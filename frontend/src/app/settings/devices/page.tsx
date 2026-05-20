"use client";

import { AppHeader } from "@/components/AppHeader";
import { DevicesPanel } from "@/components/settings/DevicesPanel";

export default function DevicesSettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader subtitle="이 계정에 등록된 기기 목록입니다" />
        <DevicesPanel />
      </div>
    </div>
  );
}
