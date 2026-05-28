"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";
import type { BlogAccount } from "@/types";

interface BlogAccountManagerProps {
  mode?: "manage" | "select";
  selectedAccountId?: string;
  onSelectAccount?: (accountId: string) => void;
  onAccountsChange?: (accounts: BlogAccount[]) => void;
  className?: string;
}

export function BlogAccountManager({
  mode = "manage",
  selectedAccountId = "",
  onSelectAccount,
  onAccountsChange,
  className,
}: BlogAccountManagerProps) {
  const [accounts, setAccounts] = useState<BlogAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newNaverId, setNewNaverId] = useState("");
  const [newNaverPw, setNewNaverPw] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const isSelectMode = mode === "select";

  const resetForm = () => {
    setNewLabel("");
    setNewNaverId("");
    setNewNaverPw("");
  };

  const syncSelection = useCallback(
    (nextAccounts: BlogAccount[]) => {
      if (!isSelectMode || !onSelectAccount) return;

      const selectable = nextAccounts.filter((account) => !account.disabled);
      if (selectable.length === 0) {
        if (selectedAccountId) onSelectAccount("");
        return;
      }

      const current = selectable.some((account) => account.id === selectedAccountId);
      if (!selectedAccountId || !current) {
        onSelectAccount(selectable[0].id);
      }
    },
    [isSelectMode, onSelectAccount, selectedAccountId],
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      const data = (await res.json()) as BlogAccount[];
      const nextAccounts = Array.isArray(data) ? data : [];
      setAccounts(nextAccounts);
      onAccountsChange?.(nextAccounts);
      syncSelection(nextAccounts);
    } catch {
      setAccounts([]);
      onAccountsChange?.([]);
    } finally {
      setLoading(false);
    }
  }, [onAccountsChange, syncSelection]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleAddAccount = async () => {
    if (!newLabel.trim() || !newNaverId.trim() || !newNaverPw) {
      toast.error("별명, 네이버 ID, 비밀번호를 모두 입력해주세요.");
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          naver_id: newNaverId.trim(),
          naver_pw: newNaverPw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "계정 추가에 실패했습니다.");
      }

      toast.success(`"${data.label}" 계정이 등록되었습니다.`);
      setShowAddDialog(false);
      resetForm();
      await fetchAccounts();
      if (isSelectMode && onSelectAccount) {
        onSelectAccount(data.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "계정 추가에 실패했습니다.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    const ok = window.confirm(
      `"${account?.label ?? "선택한"}" 계정을 삭제하시겠습니까?\n저장된 로그인 세션도 함께 삭제됩니다.`,
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/accounts?id=${encodeURIComponent(accountId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "삭제 실패" }));
        throw new Error(data.error || "삭제 실패");
      }
      toast.success("계정이 삭제되었습니다.");
      await fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  const selectAccount = (account: BlogAccount) => {
    if (!isSelectMode || account.disabled) return;
    onSelectAccount?.(account.id);
  };

  return (
    <>
      <Card
        className={cn(
          "mx-auto max-w-lg border-l-4 bg-card shadow-sm",
          isSelectMode ? "border-l-primary" : "border-l-emerald-500",
          className,
        )}
      >
        <CardHeader
          className={cn(
            "border-b px-5 py-4",
            isSelectMode ? "bg-primary/[0.04]" : "bg-emerald-500/[0.06]",
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background ring-1 ring-border">
                  <UserRound
                    className={cn(
                      "h-4 w-4",
                      isSelectMode ? "text-primary" : "text-emerald-600 dark:text-emerald-300",
                    )}
                  />
                </span>
                {isSelectMode ? "발행할 블로그 선택" : "네이버 블로그 계정"}
                <span
                  className={cn(
                    "rounded-md bg-background px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-border",
                    isSelectMode ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {accounts.length}개
                </span>
              </CardTitle>
              <CardDescription className="pl-10">
                {isSelectMode
                  ? "등록된 계정 중 이번 글을 작성할 블로그를 선택하세요."
                  : "블로그 발행에 사용할 네이버 계정을 미리 등록해두세요."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchAccounts}
                disabled={loading}
                aria-label="계정 목록 새로고침"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className={cn(
                  "gap-1.5",
                  !isSelectMode &&
                    "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                계정 추가
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pt-1">
          <div
            className={cn(
              "grid gap-3",
              isSelectMode ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2",
            )}
          >
            {accounts.map((account) => {
              const selected = selectedAccountId === account.id;
              return (
                <div
                  key={account.id}
                  className={cn(
                    "group flex min-h-[104px] flex-col justify-between rounded-lg border bg-background p-4 transition-colors",
                    isSelectMode && !account.disabled && "cursor-pointer hover:border-primary/45",
                    selected && "border-primary/70 bg-primary/[0.03]",
                    !isSelectMode && "hover:border-emerald-500/45",
                    account.disabled && "bg-muted/30 opacity-70",
                  )}
                  role={isSelectMode ? "button" : undefined}
                  tabIndex={isSelectMode && !account.disabled ? 0 : undefined}
                  onClick={() => selectAccount(account)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectAccount(account);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <UserRound
                        className={cn(
                          "h-4 w-4",
                          isSelectMode ? "text-primary" : "text-emerald-600 dark:text-emerald-300",
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{account.label}</p>
                        {account.disabled && (
                          <Badge variant="outline" className="text-[11px]">
                            확인 필요
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account.naver_id}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground opacity-80 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteAccount(account.id);
                      }}
                      aria-label={`${account.label} 계정 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          account.disabled ? "bg-muted-foreground/50" : "bg-emerald-500",
                        )}
                      />
                      {account.disabled ? "재확인 필요" : "사용 가능"}
                    </span>
                    {selected && !account.disabled && (
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        선택됨
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && accounts.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-background px-4 py-8 text-center">
              <UserRound className="h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium">등록된 계정이 없습니다</p>
              <p className="mt-1 text-xs text-muted-foreground">
                계정을 추가하면 발행 단계에서 바로 선택할 수 있습니다.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="mt-4 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                계정 추가
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>네이버 블로그 계정 추가</DialogTitle>
            <DialogDescription>
              등록한 계정은 이 기기에 저장되며, 발행 단계에서 선택해 사용할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="naver-account-label">별명</Label>
              <Input
                id="naver-account-label"
                placeholder="예: 메인 블로그"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                disabled={isAdding}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="naver-account-id">네이버 ID</Label>
              <Input
                id="naver-account-id"
                placeholder="네이버 아이디"
                value={newNaverId}
                onChange={(event) => setNewNaverId(event.target.value)}
                disabled={isAdding}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="naver-account-password">비밀번호</Label>
              <Input
                id="naver-account-password"
                type="password"
                placeholder="네이버 비밀번호"
                value={newNaverPw}
                onChange={(event) => setNewNaverPw(event.target.value)}
                disabled={isAdding}
              />
              <p className="text-xs text-muted-foreground">
                비밀번호는 저장 후 화면에 다시 표시되지 않습니다.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                resetForm();
              }}
              disabled={isAdding}
            >
              취소
            </Button>
            <Button type="button" onClick={handleAddAccount} disabled={isAdding}>
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
