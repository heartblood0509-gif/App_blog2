"use client";

// 메인 wizard와 설정 페이지(/settings/*)가 공유하는 상단 헤더.
// 좌측: 로고 + 제품명 (메인 외 경로에선 "메인으로" 링크가 함께 노출).
// 우측: 다크모드 토글 + 관리자 / API 키 / 기기 관리 아이콘.
// 이 프로젝트의 Button은 base-ui 래퍼라 asChild를 지원하지 않으므로,
// 링크 요소에는 buttonVariants로 직접 클래스만 적용한다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  KeyRound,
  LogOut,
  Megaphone,
  MonitorSmartphone,
  RotateCcw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AdminEntryButton } from "@/components/providers/AdminEntryButton";
import { useAuthSession } from "@/components/providers/AuthSessionProvider";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useWhatsNew } from "@/hooks/use-whats-new";

interface AppHeaderProps {
  onTitleClick?: () => void;
  subtitle?: string;
  /** 메인이 아닌 페이지에서 본문 큰 타이틀로 표시할 텍스트 */
  pageTitle?: string;
  /** 메인 위저드에서 진행 중일 때 좌측에 노출되는 "새로 시작" 버튼 (대안 진입) */
  showReset?: boolean;
  onResetClick?: () => void;
}

const BRAND_NAME = "Blog Pick";
const MAIN_PAGE_TITLE = "콘텐츠 생성기";

export function AppHeader({
  onTitleClick,
  subtitle,
  pageTitle,
  showReset = false,
  onResetClick,
}: AppHeaderProps) {
  const pathname = usePathname();
  const isMain = pathname === "/";
  const isApiKey = pathname?.startsWith("/settings/api-key") ?? false;
  const isDevices = pathname?.startsWith("/settings/devices") ?? false;
  const isWhatsNew = pathname?.startsWith("/whats-new") ?? false;
  const { hasUnseen } = useWhatsNew();
  const { session, logout } = useAuthSession();
  // dev 환경에선 session이 비어 있어 칩이 안 보이므로 placeholder 노출 — 시각 검수용.
  const userEmail =
    session?.user.email ??
    (process.env.NODE_ENV === "development" ? "dev@local" : null);

  return (
    <div className="mb-8">
      {/* 상단 네비게이션 row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isMain && onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
              aria-label={`${BRAND_NAME} 처음으로`}
            >
              <Logo size={32} />
              <span className="text-base font-bold tracking-tight text-primary sm:text-lg">
                {BRAND_NAME}
              </span>
            </button>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
              aria-label={`${BRAND_NAME} 메인으로`}
            >
              <Logo size={32} />
              <span className="text-base font-bold tracking-tight text-primary sm:text-lg">
                {BRAND_NAME}
              </span>
            </Link>
          )}
          {!isMain && (
            <Link
              href="/"
              aria-label="메인으로"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft className="h-4 w-4" />
              메인으로
            </Link>
          )}
        </div>

        <div className="flex items-center gap-1">
          {userEmail && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className="hidden max-w-[200px] truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline-block"
                      aria-label="로그인 계정"
                    >
                      {userEmail}
                    </span>
                  }
                />
                <TooltipContent>{userEmail}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="로그아웃"
                      onClick={() => logout()}
                    />
                  }
                >
                  <LogOut className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>로그아웃</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/whats-new"
                  aria-label={hasUnseen ? "새 소식 (새 항목 있음)" : "새 소식"}
                  className={`relative ${buttonVariants({
                    variant: isWhatsNew ? "secondary" : "ghost",
                    size: "icon",
                  })}`}
                >
                  <Megaphone className="h-4 w-4" />
                  {hasUnseen && (
                    <span
                      aria-hidden
                      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
                    />
                  )}
                </Link>
              }
            />
            <TooltipContent>
              {hasUnseen ? "새 소식 (새 항목 있음)" : "새 소식"}
            </TooltipContent>
          </Tooltip>
          <AdminEntryButton />
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/settings/api-key"
                  aria-label="API 키 설정"
                  className={buttonVariants({
                    variant: isApiKey ? "secondary" : "ghost",
                    size: "icon",
                  })}
                >
                  <KeyRound className="h-4 w-4" />
                </Link>
              }
            />
            <TooltipContent>API 키 설정</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/settings/devices"
                  aria-label="기기 관리"
                  className={buttonVariants({
                    variant: isDevices ? "secondary" : "ghost",
                    size: "icon",
                  })}
                >
                  <MonitorSmartphone className="h-4 w-4" />
                </Link>
              }
            />
            <TooltipContent>기기 관리</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 본문 타이틀 row — 메인 또는 pageTitle이 전달된 페이지 */}
      {(isMain || pageTitle) && (
        <div className="mt-20 text-center">
          {isMain && onTitleClick ? (
            <button
              onClick={onTitleClick}
              className="text-2xl font-bold tracking-tight transition-colors hover:text-primary sm:text-3xl"
            >
              {MAIN_PAGE_TITLE}
            </button>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {isMain ? MAIN_PAGE_TITLE : pageTitle}
            </h1>
          )}
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}
      {!isMain && !pageTitle && subtitle && (
        <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
