"use client";

// AuthSessionProvider는 root layout에서 이미 적용 중. 여기선 role 가드만.

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/lib/auth/auth-context";

function AdminGuard({ children }: { children: ReactNode }) {
  const { role } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (role !== null && role !== "admin") {
      const timer = window.setTimeout(() => router.replace("/"), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [role, router]);

  if (role === "admin") return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader>
          <CardTitle>접근 권한 없음</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>관리자 권한이 필요합니다. 잠시 후 홈으로 이동합니다.</p>
          <Button variant="outline" onClick={() => router.replace("/")}>
            홈으로
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
