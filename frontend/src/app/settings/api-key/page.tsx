"use client";

import { AppHeader } from "@/components/AppHeader";
import { BlogAccountManager } from "@/components/accounts/BlogAccountManager";
import { AiProviderPanel } from "@/components/settings/AiProviderPanel";
import { ApiKeyPanel } from "@/components/settings/ApiKeyPanel";
import { YoutubeKeysPanel } from "@/components/settings/YoutubeKeysPanel";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";

export default function ApiKeySettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader
          pageTitle="API 키 및 계정 설정"
          subtitle="글 생성에 필요한 Gemini 키와 블로그 발행 계정을 관리합니다"
        />
        <div className="mx-auto max-w-3xl space-y-10">
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-primary/25" />
              <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                AI 생성 설정
              </div>
              <div className="h-px flex-1 bg-primary/25" />
            </div>
            <AiProviderPanel className="max-w-none" />
            <ApiKeyPanel className="max-w-none" />
            {YOUTUBE_FEATURE_ENABLED && <YoutubeKeysPanel className="max-w-none" />}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-emerald-500/25" />
              <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                블로그 발행 설정
              </div>
              <div className="h-px flex-1 bg-emerald-500/25" />
            </div>
            <BlogAccountManager className="max-w-none" />
          </section>
        </div>
      </div>
    </div>
  );
}
