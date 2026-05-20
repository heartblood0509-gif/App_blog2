"use client";

import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/lib/auth/auth-context";

export function AdminEntryButton() {
  const { role } = useAuthContext();
  const router = useRouter();
  if (role !== "admin") return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6 lg:right-8">
      <Button
        variant="outline"
        size="sm"
        className="pointer-events-auto gap-1.5"
        onClick={() => router.push("/admin")}
      >
        <Shield className="h-4 w-4" />
        관리자
      </Button>
    </div>
  );
}
