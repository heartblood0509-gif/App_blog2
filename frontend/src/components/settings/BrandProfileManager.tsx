"use client";

// "내 정보" 페이지 안에서 브랜드 프로필을 통합 관리.
// 등록·수정 다이얼로그는 기존 BrandProfileForm 100% 재사용.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { BrandProfile } from "@/types/brand";
import { BrandProfileForm } from "@/components/brand/brand-profile-form";
import { mutateProfileStore } from "@/lib/stores/profile-mutate";
import { subscribeProfilesChanged } from "@/lib/sync/profile-sync-engine";

export function BrandProfileManager() {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrandProfile | null>(null);

  const fetchProfiles = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/brand/profiles", { cache: "no-store" });
      if (!res.ok) throw new Error("브랜드 프로필을 불러오지 못했습니다.");
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // 다른 기기의 변경이 실시간 반영되면 조용히 재조회.
  useEffect(() => {
    return subscribeProfilesChanged((kind) => {
      if (kind === "brand" || kind === "all") void fetchProfiles({ silent: true });
    });
  }, [fetchProfiles]);

  const handleCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((p: BrandProfile) => {
    setEditing(p);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (p: BrandProfile) => {
      if (!confirm(`"${p.name}" 브랜드 프로필을 삭제할까요?`)) return;
      try {
        const res = await mutateProfileStore(
          `/api/brand/profiles?id=${encodeURIComponent(p.id)}`,
          { method: "DELETE", cache: "no-store" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "삭제 실패");
        }
        toast.success("브랜드 프로필이 삭제되었습니다.");
        await fetchProfiles();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    },
    [fetchProfiles]
  );

  const handleSave = useCallback(
    async (payload: Omit<BrandProfile, "id">) => {
      try {
        const isEdit = editing !== null;
        const url = isEdit
          ? `/api/brand/profiles?id=${encodeURIComponent(editing!.id)}`
          : `/api/brand/profiles`;
        const method = isEdit ? "PUT" : "POST";
        const res = await mutateProfileStore(url, {
          method,
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${isEdit ? "수정" : "등록"} 실패`);
        }
        toast.success(`브랜드 프로필이 ${isEdit ? "수정" : "등록"}되었습니다.`);
        await fetchProfiles();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
        throw err;
      }
    },
    [editing, fetchProfiles]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          브랜드 블로그 글에 일관된 톤과 정보를 보장하는 프로필을 관리합니다.
        </p>
        <Button size="sm" onClick={handleCreate} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" />새 프로필 등록
        </Button>
      </div>

      {loading && profiles.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          불러오는 중…
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          등록된 브랜드 프로필이 없습니다. 위 [새 프로필 등록] 버튼으로 시작하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <Card key={p.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="font-medium truncate">{p.name}</span>
                  {p.category && (
                    <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                      {p.category}
                    </Badge>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => handleEdit(p)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    수정
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BrandProfileForm
        open={formOpen}
        initial={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
