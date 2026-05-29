"use client";

// /help 하위 모든 페이지(랜딩, start, usage, tools)의 공유 레이아웃.
// AppHeader + 좌측 사이드바 + children(본문) 구조.

import { AppHeader } from "@/components/AppHeader";
import { HelpSidebar } from "./_components/help-sidebar";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader
          pageTitle="사용 매뉴얼"
          subtitle="위에서부터 차근차근 따라하시면 첫 글 발행까지 가능합니다."
        />

        <div className="grid grid-cols-1 gap-10 md:grid-cols-[260px_1fr] lg:gap-14">
          <HelpSidebar />
          {children}
        </div>
      </div>
    </div>
  );
}
