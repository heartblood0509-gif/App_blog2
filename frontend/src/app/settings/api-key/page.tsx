"use client";

import { AppHeader } from "@/components/AppHeader";
import { ApiKeyPanel } from "@/components/settings/ApiKeyPanel";

export default function ApiKeySettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader subtitle="Gemini API 키를 등록하거나 변경합니다" />
        <ApiKeyPanel />
      </div>
    </div>
  );
}
