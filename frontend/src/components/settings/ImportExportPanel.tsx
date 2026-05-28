"use client";

// "내 정보" 안에서 제품·브랜드·AEO 프로필을 한 번에 내보내기/가져오기.
// 실제 동작은 기존 ProfileBundleDialog 가 다 처리 — 이 패널은 진입점만 제공.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { ProfileBundleDialog } from "@/components/profile-bundle-dialog";

export function ImportExportPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        등록된 모든 프로필(제품·브랜드·AEO)을 한 파일로 내보내거나, 다른 PC에서 만든 파일을 가져옵니다.
      </p>

      <div className="rounded-lg border bg-card/40 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">프로필 백업·이전</h3>
            <p className="text-xs text-muted-foreground">
              내보낸 파일은 다른 PC에서 그대로 가져오기 가능. 가져올 때 같은 이름은 자동으로 건너뜁니다.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1 shrink-0">
            <Download className="h-4 w-4" />
            <Upload className="h-4 w-4 -ml-1" />
            열기
          </Button>
        </div>
      </div>

      <ProfileBundleDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
