"use client";

import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { MyInfoLayout } from "@/components/settings/MyInfoLayout";

/**
 * 통합 설정 페이지 — 계정·프로필·기기를 한 화면에서 관리.
 * 좌측 사이드바에서 카테고리 선택, 우측에 그 카테고리 내용 표시.
 * 활성 카테고리는 URL 쿼리(?tab=...)로 기억 → 브라우저 뒤로가기·새로고침 시 유지.
 *
 * 기존 settings/api-key, settings/devices URL 도 그대로 유지 (백워드 호환).
 */
export default function MyInfoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader
          pageTitle="내 정보"
          subtitle="계정·프로필·기기 설정을 한 곳에서 관리합니다"
        />
        {/* URL 쿼리 파라미터를 useSearchParams 로 읽으므로 Suspense 필수 (Next 권장 패턴) */}
        <Suspense fallback={<div className="mt-8 text-sm text-muted-foreground">불러오는 중…</div>}>
          <MyInfoLayout />
        </Suspense>
      </div>
    </div>
  );
}
