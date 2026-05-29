"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Monitor,
  RefreshCcw,
  Shield,
  ShieldOff,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthContext } from "@/lib/auth/auth-context";
import type { ProfileRole, ProfileStatus } from "@/lib/auth/types";

interface AdminUser {
  id: string;
  email: string;
  status: ProfileStatus;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
  device_count: number;
  entitlement_status: string | null;
  entitlement_note: string | null;
}

interface AdminDevice {
  id: string;
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string | null;
  registered_at: string;
  last_seen_at: string | null;
  replaced_at: string | null;
}

interface AdminAuditEntry {
  id: number;
  actor_email: string | null;
  target_email: string | null;
  action: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

interface PreauthEntry {
  email: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const STATUS_LABEL: Record<ProfileStatus, string> = {
  pending: "대기",
  active: "활성",
  blocked: "차단",
  expired: "만료",
};

const STATUS_BADGE: Record<ProfileStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  active: "default",
  blocked: "destructive",
  expired: "outline",
};

export default function AdminPage() {
  const { accessToken } = useAuthContext();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState("pending");

  const [deviceDialogUser, setDeviceDialogUser] = useState<AdminUser | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [preauthEmail, setPreauthEmail] = useState("");
  const [preauthNote, setPreauthNote] = useState("");
  const [preauthBusy, setPreauthBusy] = useState(false);
  const [preauthList, setPreauthList] = useState<PreauthEntry[]>([]);
  const [loadingPreauth, setLoadingPreauth] = useState(false);

  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const authHeader = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

  const refreshUsers = useCallback(async () => {
    if (!authHeader) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users", { headers: authHeader });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "사용자 목록을 불러오지 못했습니다.");
        return;
      }
      setUsers(data.users ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "사용자 목록 요청 실패");
    } finally {
      setLoadingUsers(false);
    }
  }, [authHeader]);

  const refreshAudit = useCallback(async () => {
    if (!authHeader) return;
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/admin/audit-log?limit=100", { headers: authHeader });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "감사 로그를 불러오지 못했습니다.");
        return;
      }
      setAuditEntries(data.entries ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "감사 로그 요청 실패");
    } finally {
      setLoadingAudit(false);
    }
  }, [authHeader]);

  const refreshPreauth = useCallback(async () => {
    if (!authHeader) return;
    setLoadingPreauth(true);
    try {
      const res = await fetch("/api/admin/users/preauth", { headers: authHeader });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "사전 등록 목록을 불러오지 못했습니다.");
        return;
      }
      setPreauthList(data.entries ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "사전 등록 목록 요청 실패");
    } finally {
      setLoadingPreauth(false);
    }
  }, [authHeader]);

  useEffect(() => {
    refreshUsers();
    refreshPreauth();
  }, [refreshUsers, refreshPreauth]);

  useEffect(() => {
    if (tab === "audit") refreshAudit();
    if (tab === "preauth") refreshPreauth();
  }, [tab, refreshAudit, refreshPreauth]);

  const approveUser = useCallback(
    async (user: AdminUser) => {
      if (!authHeader) return;
      setBusyId(user.id);
      try {
        const res = await fetch("/api/admin/users/approve", {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          toast.error(data?.error ?? "승인 실패");
          return;
        }
        toast.success(`${user.email} 승인 완료`);
        await refreshUsers();
      } finally {
        setBusyId(null);
      }
    },
    [authHeader, refreshUsers],
  );

  const setStatus = useCallback(
    async (user: AdminUser, status: ProfileStatus) => {
      if (!authHeader) return;
      setBusyId(user.id);
      try {
        const res = await fetch(`/api/admin/users/${user.id}/status`, {
          method: "PATCH",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          toast.error(data?.error ?? "상태 변경 실패");
          return;
        }
        toast.success(`${user.email} → ${STATUS_LABEL[status]}`);
        await refreshUsers();
      } finally {
        setBusyId(null);
      }
    },
    [authHeader, refreshUsers],
  );

  const setRole = useCallback(
    async (user: AdminUser, role: ProfileRole) => {
      if (!authHeader) return;
      setBusyId(user.id);
      try {
        const res = await fetch(`/api/admin/users/${user.id}/role`, {
          method: "PATCH",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          const msg =
            typeof data?.error === "string" && data.error.includes("last_admin")
              ? "마지막 관리자는 강등할 수 없습니다."
              : (data?.error ?? "역할 변경 실패");
          toast.error(msg);
          return;
        }
        toast.success(`${user.email} → ${role === "admin" ? "관리자" : "일반"}`);
        await refreshUsers();
      } finally {
        setBusyId(null);
      }
    },
    [authHeader, refreshUsers],
  );

  const openDevices = useCallback(
    async (user: AdminUser) => {
      if (!authHeader) return;
      setDeviceDialogUser(user);
      setLoadingDevices(true);
      try {
        const res = await fetch(`/api/admin/users/${user.id}/devices`, { headers: authHeader });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          toast.error(data?.error ?? "기기 목록 실패");
          setDevices([]);
          return;
        }
        setDevices(data.devices ?? []);
      } finally {
        setLoadingDevices(false);
      }
    },
    [authHeader],
  );

  const resetDevices = useCallback(async () => {
    if (!authHeader || !deviceDialogUser) return;
    if (!window.confirm(`${deviceDialogUser.email}의 등록 기기를 모두 해제할까요?`)) return;
    setLoadingDevices(true);
    try {
      const res = await fetch(`/api/admin/users/${deviceDialogUser.id}/devices`, {
        method: "DELETE",
        headers: authHeader,
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "기기 초기화 실패");
        return;
      }
      toast.success(`${data.reset_count ?? 0}대 기기 초기화 완료`);
      setDeviceDialogUser(null);
      await refreshUsers();
    } finally {
      setLoadingDevices(false);
    }
  }, [authHeader, deviceDialogUser, refreshUsers]);

  const submitPreauth = useCallback(async () => {
    if (!authHeader || !preauthEmail.trim()) return;
    setPreauthBusy(true);
    try {
      const res = await fetch("/api/admin/users/preauth", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: preauthEmail.trim(),
          note: preauthNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "사전 등록 실패");
        return;
      }
      toast.success(`${preauthEmail.trim()} 사전 등록 완료`);
      setPreauthEmail("");
      setPreauthNote("");
      await Promise.all([refreshUsers(), refreshPreauth()]);
    } finally {
      setPreauthBusy(false);
    }
  }, [authHeader, preauthEmail, preauthNote, refreshUsers, refreshPreauth]);

  const pendingUsers = users.filter((u) => u.status === "pending");

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">관리자 콘솔</h1>
            <p className="text-sm text-muted-foreground">
              가입 승인, 사용자 상태, 등록 기기를 관리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshUsers} disabled={loadingUsers}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              메인
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending">
              가입 대기
              {pendingUsers.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingUsers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">전체 사용자</TabsTrigger>
            <TabsTrigger value="preauth">
              사전 등록
              {preauthList.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {preauthList.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit">감사 로그</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <UserTable
              users={pendingUsers}
              loading={loadingUsers}
              busyId={busyId}
              onApprove={approveUser}
              onSetStatus={setStatus}
              onSetRole={setRole}
              onOpenDevices={openDevices}
              emptyMessage="대기 중인 사용자가 없습니다."
            />
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <UserTable
              users={users}
              loading={loadingUsers}
              busyId={busyId}
              onApprove={approveUser}
              onSetStatus={setStatus}
              onSetRole={setRole}
              onOpenDevices={openDevices}
              emptyMessage="사용자가 없습니다."
            />
          </TabsContent>

          <TabsContent value="preauth" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>이메일 사전 등록</CardTitle>
                <CardDescription>
                  아직 로그인하지 않은 사용자의 이메일을 미리 활성으로 등록합니다.
                  해당 이메일로 처음 로그인하는 순간 자동으로 활성 사용자가 됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="preauth-email">이메일</Label>
                  <Input
                    id="preauth-email"
                    type="email"
                    placeholder="buyer@example.com"
                    value={preauthEmail}
                    onChange={(e) => setPreauthEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preauth-note">메모 (선택)</Label>
                  <Input
                    id="preauth-note"
                    placeholder="구매 채널, 주문번호 등"
                    value={preauthNote}
                    onChange={(e) => setPreauthNote(e.target.value)}
                  />
                </div>
                <Button
                  onClick={submitPreauth}
                  disabled={!preauthEmail.trim() || preauthBusy}
                  className="gap-2"
                >
                  {preauthBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  사전 등록
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>사전 등록 대기 목록</CardTitle>
                  <CardDescription>
                    아직 로그인하지 않은 사전 등록 이메일입니다. 첫 로그인 시 위쪽
                    사용자 목록으로 이동합니다.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshPreauth}
                  disabled={loadingPreauth}
                >
                  <RefreshCcw className={`mr-2 h-4 w-4 ${loadingPreauth ? "animate-spin" : ""}`} />
                  새로고침
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[480px]">
                  <div className="divide-y">
                    {loadingPreauth && preauthList.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </div>
                    )}
                    {!loadingPreauth && preauthList.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        사전 등록 대기 중인 이메일이 없습니다.
                      </div>
                    )}
                    {preauthList.map((entry) => (
                      <div
                        key={entry.email}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{entry.email}</span>
                            <Badge variant="secondary">미로그인</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            등록: {formatDate(entry.created_at)}
                            {entry.note && ` · ${entry.note}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>감사 로그</CardTitle>
                  <CardDescription>최근 100건의 관리자 행위 기록</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={refreshAudit} disabled={loadingAudit}>
                  <RefreshCcw className={`mr-2 h-4 w-4 ${loadingAudit ? "animate-spin" : ""}`} />
                  새로고침
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[480px] rounded-md border">
                  <div className="divide-y">
                    {auditEntries.length === 0 && !loadingAudit && (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        기록이 없습니다.
                      </div>
                    )}
                    {auditEntries.map((entry) => (
                      <div key={entry.id} className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{entry.action}</Badge>
                          <span className="font-medium">{entry.actor_email ?? "-"}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{entry.target_email ?? "-"}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDate(entry.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={deviceDialogUser !== null}
        onOpenChange={(open) => !open && setDeviceDialogUser(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>등록 기기 — {deviceDialogUser?.email}</DialogTitle>
            <DialogDescription>
              활성 기기를 모두 해제하면 사용자는 다음 로그인 시 새 기기로 다시 등록할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] rounded-md border">
            <div className="divide-y">
              {loadingDevices && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </div>
              )}
              {!loadingDevices && devices.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  등록된 기기가 없습니다.
                </div>
              )}
              {devices.map((d) => (
                <div key={d.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{d.device_name}</span>
                    <Badge variant={d.replaced_at ? "outline" : "default"}>
                      {d.replaced_at ? "해제됨" : "활성"}
                    </Badge>
                    {d.platform && (
                      <Badge variant="secondary" className="text-xs">
                        {d.platform}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    등록: {formatDate(d.registered_at)} · 마지막 사용: {formatDate(d.last_seen_at)}
                    {d.replaced_at && ` · 해제: ${formatDate(d.replaced_at)}`}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{d.device_id}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceDialogUser(null)}>
              닫기
            </Button>
            <Button
              variant="destructive"
              onClick={resetDevices}
              disabled={
                loadingDevices ||
                devices.filter((d) => !d.replaced_at).length === 0
              }
            >
              활성 기기 모두 해제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function UserTable({
  users,
  loading,
  busyId,
  onApprove,
  onSetStatus,
  onSetRole,
  onOpenDevices,
  emptyMessage,
}: {
  users: AdminUser[];
  loading: boolean;
  busyId: string | null;
  onApprove: (u: AdminUser) => void;
  onSetStatus: (u: AdminUser, s: ProfileStatus) => void;
  onSetRole: (u: AdminUser, r: ProfileRole) => void;
  onOpenDevices: (u: AdminUser) => void;
  emptyMessage: string;
}) {
  if (loading && users.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px]">
          <div className="divide-y">
            {users.map((u) => {
              const busy = busyId === u.id;
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.email}</span>
                      <Badge variant={STATUS_BADGE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                      {u.role === "admin" && (
                        <Badge variant="default" className="gap-1">
                          <Shield className="h-3 w-3" />
                          관리자
                        </Badge>
                      )}
                      <Badge variant="outline" className="gap-1">
                        <Monitor className="h-3 w-3" />
                        {u.device_count}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      가입: {formatDate(u.created_at)}
                      {u.entitlement_note && ` · ${u.entitlement_note}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {u.status !== "active" && (
                      <Button
                        size="sm"
                        onClick={() => onApprove(u)}
                        disabled={busy}
                        className="gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        승인
                      </Button>
                    )}
                    {u.status === "active" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onSetStatus(u, "blocked")}
                        disabled={busy}
                      >
                        차단
                      </Button>
                    )}
                    {u.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetStatus(u, "expired")}
                        disabled={busy}
                      >
                        만료
                      </Button>
                    )}
                    {(u.status === "blocked" || u.status === "expired") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetStatus(u, "active")}
                        disabled={busy}
                      >
                        활성화
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenDevices(u)}
                      disabled={busy}
                      className="gap-1"
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      기기
                    </Button>
                    {u.role === "user" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetRole(u, "admin")}
                        disabled={busy}
                        className="gap-1"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        관리자 승격
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetRole(u, "user")}
                        disabled={busy}
                        className="gap-1"
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                        승격 해제
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
