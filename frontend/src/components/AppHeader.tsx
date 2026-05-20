"use client";

// 메인 wizard와 설정 페이지(/settings/*)가 공유하는 상단 헤더.
// 우측: API 키 / 기기 관리 아이콘. 메인 외 경로에서는 좌측에 "메인으로" 링크 노출.
// 이 프로젝트의 Button은 base-ui 래퍼라 asChild를 지원하지 않으므로,
// 링크 요소에는 buttonVariants로 직접 클래스만 적용한다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, KeyRound, MonitorSmartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppHeaderProps {
  onTitleClick?: () => void;
  subtitle?: string;
}

export function AppHeader({ onTitleClick, subtitle }: AppHeaderProps) {
  const pathname = usePathname();
  const isMain = pathname === "/";
  const isApiKey = pathname?.startsWith("/settings/api-key") ?? false;
  const isDevices = pathname?.startsWith("/settings/devices") ?? false;

  return (
    <div className="relative mb-8">
      {!isMain && (
        <div className="absolute left-0 top-0">
          <Link
            href="/"
            aria-label="메인으로"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="h-4 w-4" />
            메인으로
          </Link>
        </div>
      )}

      <div className="absolute right-0 top-0 flex items-center gap-1">
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

      <div className="pt-2 text-center">
        {isMain && onTitleClick ? (
          <button
            onClick={onTitleClick}
            className="text-2xl font-bold tracking-tight transition-colors hover:text-primary sm:text-3xl"
          >
            콘텐츠 생성기
          </button>
        ) : (
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight transition-colors hover:text-primary sm:text-3xl"
          >
            콘텐츠 생성기
          </Link>
        )}
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
