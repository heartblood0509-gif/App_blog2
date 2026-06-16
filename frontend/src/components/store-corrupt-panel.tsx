"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw, Upload } from "lucide-react";

interface StoreCorruptPanelProps {
  /** 사람이 읽는 대상 이름. 예: "제품", "브랜드 프로필", "분석 보관함" */
  kind: string;
  /** 다시 불러오기(백엔드가 .bak 에서 재복구 시도) */
  onRetry: () => void;
  /** 백업 파일에서 복원(가져오기) 진입. 없으면 버튼 숨김(예: 분석 보관함). */
  onImport?: () => void;
}

/**
 * 저장소 손상으로 목록을 못 불러왔을 때 빈 화면 대신 보여주는 복구 안내 패널.
 * "데이터는 삭제되지 않았다"를 명확히 전달하고, 복구 행동(재시도/복원)을 제공한다.
 */
export function StoreCorruptPanel({ kind, onRetry, onImport }: StoreCorruptPanelProps) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-50/50 p-6 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{kind}을(를) 불러오지 못했습니다 (저장소 손상)</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              대부분 자동으로 복구되지만 이번엔 실패했습니다.{" "}
              <strong className="font-medium text-foreground">데이터는 삭제되지 않았습니다.</strong>{" "}
              아래로 복구를 시도해 주세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onRetry} className="gap-1">
              <RotateCw className="h-3.5 w-3.5" />복구 다시 시도
            </Button>
            {onImport && (
              <Button size="sm" variant="outline" onClick={onImport} className="gap-1">
                <Upload className="h-3.5 w-3.5" />백업 파일에서 복원
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
