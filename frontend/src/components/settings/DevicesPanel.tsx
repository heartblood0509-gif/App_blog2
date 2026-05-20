"use client";

// 등록된 기기 목록을 보여주는 패널.
// 데이터는 AuthSessionProvider가 들고 있는 result.devices를 사용하고,
// 마운트 시 /api/auth/device/list (RPC list_devices) 1회 호출로 최신화한다.

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthSession } from "@/components/providers/AuthSessionProvider";

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DevicesPanel() {
  const { devices, deviceInfo, refreshDevices } = useAuthSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    refreshDevices()
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "기기 목록을 불러오지 못했습니다."),
      )
      .finally(() => setLoading(false));
  }, [refreshDevices]);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>등록된 기기</CardTitle>
        <CardDescription>
          이 계정에 등록되어 있는 기기 목록입니다. 현재 사용 중인 기기에는 배지가 표시됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && devices.length === 0 && (
          <div className="text-sm text-muted-foreground">불러오는 중...</div>
        )}

        {!loading && devices.length === 0 && !error && (
          <div className="text-sm text-muted-foreground">등록된 기기가 없습니다.</div>
        )}

        {devices.map((device) => {
          const isCurrent = deviceInfo?.device_id === device.device_id;
          return (
            <div
              key={device.device_id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{device.device_name}</span>
                  {isCurrent && <Badge>현재 기기</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">{device.platform}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  마지막 확인: {formatDate(device.last_seen_at)}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
