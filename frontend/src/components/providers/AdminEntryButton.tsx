"use client";

// 메인/설정 헤더 우측에 관리자만 보이는 진입 아이콘.
// API 키·기기 관리 아이콘과 같은 스타일(아이콘 + Tooltip) 유지.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthContext } from "@/lib/auth/auth-context";

export function AdminEntryButton() {
  const { role } = useAuthContext();
  const pathname = usePathname();
  if (role !== "admin") return null;

  const isAdmin = pathname?.startsWith("/admin") ?? false;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/admin"
            aria-label="관리자 콘솔"
            className={buttonVariants({
              variant: isAdmin ? "secondary" : "ghost",
              size: "icon",
            })}
          >
            <Shield className="h-4 w-4" />
          </Link>
        }
      />
      <TooltipContent>관리자 콘솔</TooltipContent>
    </Tooltip>
  );
}
