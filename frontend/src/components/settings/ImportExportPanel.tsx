"use client";

// "내 정보" 안에서 제품·브랜드·AEO 프로필 + 보관함을 한 번에 내보내기/가져오기.
// 파일 백업은 기존 ProfileBundleDialog 가 처리하고, 이 패널은 진입점 + 클라우드 백업 상태를 보여준다.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, CheckCircle2, AlertCircle, RefreshCcw } from "lucide-react";
import { ProfileBundleDialog } from "@/components/profile-bundle-dialog";
import {
  getCloudSyncStatus,
  subscribeCloudSyncStatus,
  type CloudSyncStatus,
} from "@/lib/sync/cloud-sync";

function formatBackupTime(iso: string | null): string {
  if (!iso) return "백업 기록 없음";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "백업 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function CloudBackupStatus() {
  const [status, setStatus] = useState<CloudSyncStatus>(() => getCloudSyncStatus());

  useEffect(() => subscribeCloudSyncStatus(setStatus), []);

  const hasError = !!status.lastError;

  return (
    <div className="rounded-lg border bg-card/40 p-4">
      <div className="flex items-start gap-3">
        {hasError ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        ) : status.pending ? (
          <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        )}
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">자동 클라우드 백업</h3>
          <p className="text-xs text-muted-foreground">
            로그인 계정에 프로필·보관함이 자동 백업됩니다. 새 PC에서 로그인하면 자동으로 복원돼요.
            (API키·네이버 비밀번호는 보안상 제외 — 새 PC에서 다시 입력)
          </p>
          {hasError ? (
            <p className="text-xs text-destructive">
              백업 안 됨: {status.lastError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              마지막 백업: <span className="font-medium text-foreground">{formatBackupTime(status.lastBackupAt)}</span>
              {status.pending && " · 백업 중…"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ImportExportPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        프로필(제품·브랜드·AEO)과 보관함은 로그인 계정에 자동 백업됩니다. 아래에서 파일로 직접 내보내거나 가져올 수도 있어요.
      </p>

      <CloudBackupStatus />

      <div className="rounded-lg border bg-card/40 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">파일로 백업·이전</h3>
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
