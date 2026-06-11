"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Monitor,
  Pencil,
  RefreshCcw,
  Search,
  Shield,
  ShieldOff,
  SquarePlay,
  Trash2,
  UserPlus,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  entitlement_plan: string | null;
  entitlement_note: string | null;
  display_name: string | null;
  memo: string | null;
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
  display_name: string | null;
  memo: string | null;
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

type StatusFilter = ProfileStatus | "all";
type RoleFilter = ProfileRole | "all";
type SortField = "created_at" | "name";
type SortOrder = "asc" | "desc";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체 상태" },
  { value: "active", label: "활성" },
  { value: "pending", label: "대기" },
  { value: "blocked", label: "차단" },
  { value: "expired", label: "만료" },
];

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "전체 역할" },
  { value: "admin", label: "관리자" },
  { value: "user", label: "일반 사용자" },
];

const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: "created_at", label: "가입일순" },
  { value: "name", label: "이름순" },
];

export default function AdminPage() {
  const { accessToken } = useAuthContext();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState("pending");

  // 전체 사용자 탭: 검색 / 필터 / 정렬
  const [userQuery, setUserQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [deviceDialogUser, setDeviceDialogUser] = useState<AdminUser | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [preauthEmail, setPreauthEmail] = useState("");
  const [preauthName, setPreauthName] = useState("");
  const [preauthMemo, setPreauthMemo] = useState("");
  const [preauthBusy, setPreauthBusy] = useState(false);
  const [preauthList, setPreauthList] = useState<PreauthEntry[]>([]);
  const [loadingPreauth, setLoadingPreauth] = useState(false);

  // 이름/메모 편집 다이얼로그 (사용자·사전등록 공용)
  const [editTarget, setEditTarget] = useState<{
    email: string;
    display_name: string;
    memo: string;
  } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

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
          const err = typeof data?.error === "string" ? data.error : "";
          const msg = err.includes("cannot_block_self")
            ? "관리자 본인 계정은 비활성으로 바꿀 수 없습니다."
            : err.includes("last_admin")
              ? "마지막 활성 관리자는 차단/만료할 수 없습니다."
              : (err || "상태 변경 실패");
          toast.error(msg);
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

  const setPlan = useCallback(
    async (user: AdminUser, plan: "blog" | "blog_youtube") => {
      if (!authHeader) return;
      setBusyId(user.id);
      try {
        const res = await fetch(`/api/admin/users/plan`, {
          method: "PATCH",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, plan }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          toast.error(data?.error ?? "유튜브 플랜 변경 실패");
          return;
        }
        toast.success(
          `${user.email} 유튜브 ${plan === "blog_youtube" ? "ON" : "OFF"}`,
        );
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
          display_name: preauthName.trim() || null,
          memo: preauthMemo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const msg =
          typeof data?.error === "string" && data.error.includes("already_registered")
            ? "이미 등록된 사용자입니다. 이름/메모를 바꾸려면 사용자 목록에서 수정하세요."
            : (data?.error ?? "사전 등록 실패");
        toast.error(msg);
        return;
      }
      toast.success(`${preauthEmail.trim()} 사전 등록 완료`);
      setPreauthEmail("");
      setPreauthName("");
      setPreauthMemo("");
      await Promise.all([refreshUsers(), refreshPreauth()]);
    } finally {
      setPreauthBusy(false);
    }
  }, [authHeader, preauthEmail, preauthName, preauthMemo, refreshUsers, refreshPreauth]);

  const deletePreauth = useCallback(
    async (entry: PreauthEntry) => {
      if (!authHeader) return;
      if (
        !window.confirm(
          `${entry.email}의 사전 등록을 취소(삭제)할까요?\n아직 로그인하지 않은 이메일만 삭제됩니다.`,
        )
      ) {
        return;
      }
      try {
        const res = await fetch("/api/admin/users/preauth", {
          method: "DELETE",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ email: entry.email }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          const msg =
            typeof data?.error === "string" && data.error.includes("already_logged_in")
              ? "이미 로그인한 사용자입니다. 사용자 목록에서 차단/만료로 처리하세요."
              : (data?.error ?? "사전 등록 취소 실패");
          toast.error(msg);
          return;
        }
        toast.success(`${entry.email} 사전 등록 취소 완료`);
        await refreshPreauth();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "사전 등록 취소 실패");
      }
    },
    [authHeader, refreshPreauth],
  );

  const submitEdit = useCallback(async () => {
    if (!authHeader || !editTarget) return;
    setEditBusy(true);
    try {
      const res = await fetch("/api/admin/users/entitlement", {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editTarget.email,
          display_name: editTarget.display_name.trim() || null,
          memo: editTarget.memo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "저장 실패");
        return;
      }
      toast.success(`${editTarget.email} 정보 저장 완료`);
      setEditTarget(null);
      await Promise.all([refreshUsers(), refreshPreauth()]);
    } finally {
      setEditBusy(false);
    }
  }, [authHeader, editTarget, refreshUsers, refreshPreauth]);

  const pendingUsers = users.filter((u) => u.status === "pending");

  // 검색어: 쉼표(,) 또는 줄바꿈으로 여러 명 분리 (빈 항목 제거, 소문자화)
  const searchTerms = useMemo(
    () =>
      userQuery
        .split(/[,\n]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [userQuery],
  );

  // 전체 사용자: 검색어·필터 적용 후 정렬한 목록
  const visibleUsers = useMemo(() => {
    const filtered = users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (searchTerms.length > 0) {
        // 여러 검색어 중 하나라도 이메일/이름에 포함되면 표시 (OR)
        const haystack = `${u.email} ${u.display_name ?? ""}`.toLowerCase();
        if (!searchTerms.some((t) => haystack.includes(t))) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortField === "name") {
        // 이름이 없는 사용자는 이메일을 기준으로 정렬
        const an = (a.display_name ?? a.email).toLowerCase();
        const bn = (b.display_name ?? b.email).toLowerCase();
        cmp = an.localeCompare(bn, "ko");
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [users, searchTerms, statusFilter, roleFilter, sortField, sortOrder]);

  const userFiltersActive =
    searchTerms.length > 0 || statusFilter !== "all" || roleFilter !== "all";

  const resetUserFilters = () => {
    setUserQuery("");
    setStatusFilter("all");
    setRoleFilter("all");
  };

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
              onSetPlan={setPlan}
              onOpenDevices={openDevices}
              onEdit={(u) =>
                setEditTarget({
                  email: u.email,
                  display_name: u.display_name ?? "",
                  memo: u.memo ?? "",
                })
              }
              emptyMessage="대기 중인 사용자가 없습니다."
            />
          </TabsContent>

          <TabsContent value="all" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Textarea
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="이메일 또는 이름으로 검색 — 여러 명은 쉼표(,)나 줄바꿈으로 구분"
                rows={1}
                className="max-h-40 min-h-9 resize-none py-1.5 pl-8 pr-8"
              />
              {userQuery && (
                <button
                  type="button"
                  onClick={() => setUserQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute right-2 top-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onValueChange={(v) => v && setStatusFilter(v)}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={ROLE_FILTER_OPTIONS}
                value={roleFilter}
                onValueChange={(v) => v && setRoleFilter(v)}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={SORT_FIELD_OPTIONS}
                value={sortField}
                onValueChange={(v) => v && setSortField(v)}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_FIELD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                className="gap-1.5"
                title={sortOrder === "asc" ? "오름차순" : "내림차순"}
              >
                {sortOrder === "asc" ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
                {sortOrder === "asc" ? "오름차순" : "내림차순"}
              </Button>
            </div>

            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>
                {visibleUsers.length}명
                {userFiltersActive && ` (전체 ${users.length}명)`}
              </span>
              {userFiltersActive && (
                <button
                  type="button"
                  onClick={resetUserFilters}
                  className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                >
                  필터 초기화
                </button>
              )}
            </div>

            <UserTable
              users={visibleUsers}
              loading={loadingUsers}
              busyId={busyId}
              onApprove={approveUser}
              onSetStatus={setStatus}
              onSetRole={setRole}
              onSetPlan={setPlan}
              onOpenDevices={openDevices}
              onEdit={(u) =>
                setEditTarget({
                  email: u.email,
                  display_name: u.display_name ?? "",
                  memo: u.memo ?? "",
                })
              }
              emptyMessage={
                userFiltersActive
                  ? "검색·필터 조건에 맞는 사용자가 없습니다."
                  : "사용자가 없습니다."
              }
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
                  <Label htmlFor="preauth-name">사용자 이름 (선택)</Label>
                  <Input
                    id="preauth-name"
                    placeholder="예: 홍길동"
                    value={preauthName}
                    onChange={(e) => setPreauthName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preauth-memo">메모 (선택)</Label>
                  <Textarea
                    id="preauth-memo"
                    rows={5}
                    placeholder="구매 채널, 주문번호, 특이사항 등 자유롭게 기록"
                    value={preauthMemo}
                    onChange={(e) => setPreauthMemo(e.target.value)}
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
                        className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{entry.email}</span>
                            {entry.display_name && (
                              <Badge variant="outline">{entry.display_name}</Badge>
                            )}
                            <Badge variant="secondary">미로그인</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            등록: {formatDate(entry.created_at)}
                          </div>
                          {entry.memo && (
                            <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                              {entry.memo}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() =>
                              setEditTarget({
                                email: entry.email,
                                display_name: entry.display_name ?? "",
                                memo: entry.memo ?? "",
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            편집
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-destructive hover:text-destructive"
                            onClick={() => deletePreauth(entry)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            삭제
                          </Button>
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

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>이름·메모 편집</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-name">사용자 이름</Label>
                <Input
                  id="edit-name"
                  placeholder="예: 홍길동"
                  value={editTarget.display_name}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, display_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-memo">메모</Label>
                <Textarea
                  id="edit-memo"
                  rows={5}
                  placeholder="사용자 관련 특이사항을 자유롭게 기록"
                  value={editTarget.memo}
                  onChange={(e) => setEditTarget({ ...editTarget, memo: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              취소
            </Button>
            <Button onClick={submitEdit} disabled={editBusy} className="gap-2">
              {editBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              저장
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
  onSetPlan,
  onOpenDevices,
  onEdit,
  emptyMessage,
}: {
  users: AdminUser[];
  loading: boolean;
  busyId: string | null;
  onApprove: (u: AdminUser) => void;
  onSetStatus: (u: AdminUser, s: ProfileStatus) => void;
  onSetRole: (u: AdminUser, r: ProfileRole) => void;
  onSetPlan: (u: AdminUser, p: "blog" | "blog_youtube") => void;
  onOpenDevices: (u: AdminUser) => void;
  onEdit: (u: AdminUser) => void;
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
                <div key={u.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.email}</span>
                      {u.display_name && <Badge variant="outline">{u.display_name}</Badge>}
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
                      {/* 유튜브 OFF(미구매)만 배지로 표시 — 기본값은 ON 이라 평소엔 안 보임 */}
                      {u.entitlement_plan === "blog" && (
                        <Badge variant="secondary" className="gap-1">
                          <SquarePlay className="h-3 w-3" />
                          유튜브 OFF
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      가입: {formatDate(u.created_at)}
                    </div>
                    {u.memo && (
                      <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                        {u.memo}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {/* 가입 대기(pending)만 승인. 차단/만료는 각자의 복구 버튼을 쓴다. */}
                    {u.status === "pending" && (
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
                        variant="outline"
                        onClick={() => onSetStatus(u, "expired")}
                        disabled={busy}
                      >
                        만료
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
                    {/* 만료: 가볍게 1클릭 복구 */}
                    {u.status === "expired" && (
                      <Button
                        size="sm"
                        onClick={() => onSetStatus(u, "active")}
                        disabled={busy}
                        className="gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        활성화
                      </Button>
                    )}
                    {/* 차단: 실수 방지를 위해 확인 한 단계 더 */}
                    {u.status === "blocked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              `${u.email}의 차단을 해제하고 활성화할까요?\n차단은 문제가 있어 막은 계정입니다. 정말 해제하시겠습니까?`,
                            )
                          ) {
                            onSetStatus(u, "active");
                          }
                        }}
                        disabled={busy}
                      >
                        차단 해제
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(u)}
                      disabled={busy}
                      className="gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      편집
                    </Button>
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
                    {/* 유튜브 플랜 토글 — 기본 ON(blog_youtube/null), 클릭으로 OFF(blog) ↔ ON */}
                    {u.entitlement_plan === "blog" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetPlan(u, "blog_youtube")}
                        disabled={busy}
                        className="gap-1"
                      >
                        <SquarePlay className="h-3.5 w-3.5" />
                        유튜브 ON
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetPlan(u, "blog")}
                        disabled={busy}
                        className="gap-1"
                      >
                        <SquarePlay className="h-3.5 w-3.5" />
                        유튜브 OFF
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
