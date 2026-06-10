"use client";

// "내 정보" 페이지의 좌측 사이드바 + 우측 컨텐츠 레이아웃.
// 활성 탭은 URL 쿼리(?tab=...)로 보관 → 브라우저 뒤로가기/새로고침에도 유지.
//
// 디자인 원칙: 기존 settings/api-key 페이지의 톤(bg-primary/10 chip, 시맨틱 토큰)을 그대로 따라
// Blog Pick 전체와 일관된 룩앤필을 유지. 새로 만든 색·간격 없음 — 다 기존 토큰 재사용.
//
// 모바일 대응: 좁은 화면에선 사이드바를 상단 가로 스크롤 탭바로 자동 전환.

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  KeyRound,
  MonitorSmartphone,
  Package,
  PenLine,
  Tag,
  Target,
  Download,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiProviderPanel } from "@/components/settings/AiProviderPanel";
import { ApiKeyPanel } from "@/components/settings/ApiKeyPanel";
import { YoutubeKeysPanel } from "@/components/settings/YoutubeKeysPanel";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";
import { BlogAccountManager } from "@/components/accounts/BlogAccountManager";
import { DevicesPanel } from "@/components/settings/DevicesPanel";
import { ProductManager } from "@/components/settings/ProductManager";
import { BrandProfileManager } from "@/components/settings/BrandProfileManager";
import { AeoProfileManager } from "@/components/settings/AeoProfileManager";
import { ImportExportPanel } from "@/components/settings/ImportExportPanel";
import { DraftLibraryPanel } from "@/components/settings/DraftLibraryPanel";
import { SetupChecklist } from "@/components/settings/SetupChecklist";

type TabId =
  | "api-generation"
  | "blog-account"
  | "devices"
  | "products"
  | "brand-profiles"
  | "aeo-profiles"
  | "draft-library"
  | "import-export";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
  /** 사이드바 그룹 라벨 — 같은 group 인 탭들 사이에 구분선 */
  group: "account" | "profile" | "data";
}

const TABS: TabDef[] = [
  { id: "api-generation", label: "API 생성 설정", icon: KeyRound, group: "account" },
  { id: "blog-account", label: "블로그 계정 설정", icon: PenLine, group: "account" },
  { id: "devices", label: "기기 설정", icon: MonitorSmartphone, group: "account" },
  { id: "products", label: "제품 프로필", icon: Package, group: "profile" },
  { id: "brand-profiles", label: "브랜드 프로필", icon: Tag, group: "profile" },
  { id: "aeo-profiles", label: "AEO 프로필", icon: Target, group: "profile" },
  { id: "draft-library", label: "글 보관함", icon: BookOpen, group: "data" },
  { id: "import-export", label: "가져오기 / 내보내기", icon: Download, group: "data" },
];

const DEFAULT_TAB: TabId = "api-generation";

function isValidTab(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

export function MyInfoLayout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawTab = searchParams.get("tab");
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  const handleTabClick = useCallback(
    (id: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  return (
    <div className="mt-8 space-y-6">
      {/* 상단: 시작 가이드 (미완료 항목 있을 때만 자동 표시) */}
      <SetupChecklist onGoToTab={(id) => handleTabClick(id as TabId)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      {/* ───── 좌측 사이드바 (모바일: 상단 가로 스크롤) ───── */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <nav
          aria-label="내 정보 카테고리"
          className="flex gap-1 overflow-x-auto rounded-lg border bg-card/40 p-1 lg:flex-col lg:overflow-visible lg:p-2"
        >
          {TABS.map((tab, idx) => {
            const isActive = tab.id === activeTab;
            const prevTab = idx > 0 ? TABS[idx - 1] : null;
            const showDivider = prevTab && prevTab.group !== tab.group;
            return (
              <div key={tab.id} className="contents">
                {showDivider && (
                  <div
                    aria-hidden
                    className="hidden h-px bg-border/60 lg:my-1 lg:block"
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleTabClick(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "lg:w-full lg:justify-start",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ───── 우측 컨텐츠 ───── */}
      <section className="min-w-0">
        {activeTab === "api-generation" && <ApiGenerationSection />}
        {activeTab === "blog-account" && <BlogAccountSection />}
        {activeTab === "devices" && <DevicesSection />}
        {activeTab === "products" && <ProductsPlaceholderSection />}
        {activeTab === "brand-profiles" && <BrandProfilesPlaceholderSection />}
        {activeTab === "aeo-profiles" && <AeoProfilesPlaceholderSection />}
        {activeTab === "draft-library" && <DraftLibrarySection />}
        {activeTab === "import-export" && <ImportExportPlaceholderSection />}
      </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 각 탭 본문 — 기존 컴포넌트 재사용 (디자인 그대로 상속)
// ─────────────────────────────────────────────

/** 섹션 헤더 — 기존 api-key 페이지와 동일 톤 (라인 + chip + 라인) */
function SectionDivider({
  label,
  color = "primary",
}: {
  label: string;
  color?: "primary" | "emerald";
}) {
  const lineCls = color === "emerald" ? "bg-emerald-500/25" : "bg-primary/25";
  const chipCls =
    color === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "bg-primary/10 text-primary";
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-px flex-1", lineCls)} />
      <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", chipCls)}>
        {label}
      </div>
      <div className={cn("h-px flex-1", lineCls)} />
    </div>
  );
}

function ApiGenerationSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="AI 생성 설정" />
      <AiProviderPanel className="max-w-none" />
      <ApiKeyPanel className="max-w-none" />
      {YOUTUBE_FEATURE_ENABLED && <YoutubeKeysPanel className="max-w-none" />}
    </div>
  );
}

function BlogAccountSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="블로그 계정 설정" color="emerald" />
      <BlogAccountManager className="max-w-none" />
    </div>
  );
}

function DevicesSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="등록된 기기" />
      <DevicesPanel />
    </div>
  );
}

// ─────────────────────────────────────────────
// 제품·브랜드·AEO 프로필 + 가져오기/내보내기 — 전용 매니저 컴포넌트 호출.
// 등록·수정 다이얼로그는 글 작성 흐름과 동일 컴포넌트를 100% 재사용.
// ─────────────────────────────────────────────

function ProductsPlaceholderSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="제품 프로필" />
      <ProductManager />
    </div>
  );
}

function BrandProfilesPlaceholderSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="브랜드 프로필" />
      <BrandProfileManager />
    </div>
  );
}

function AeoProfilesPlaceholderSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="AEO 프로필" />
      <AeoProfileManager />
    </div>
  );
}

function DraftLibrarySection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="글 보관함" />
      <DraftLibraryPanel />
    </div>
  );
}

function ImportExportPlaceholderSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <SectionDivider label="가져오기 / 내보내기" />
      <ImportExportPanel />
    </div>
  );
}
