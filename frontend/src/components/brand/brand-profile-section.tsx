"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import type { BrandProfile } from "@/types/brand";
import { BrandProfileForm } from "./brand-profile-form";

interface BrandProfileSectionProps {
  selectedProfileId: string | null;
  onSelect: (profileId: string) => void;
}

export function BrandProfileSection({ selectedProfileId, onSelect }: BrandProfileSectionProps) {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrandProfile | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brand/profiles", { cache: "no-store" });
      if (!res.ok) throw new Error("브랜드 프로필을 불러오지 못했습니다.");
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((p: BrandProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(p);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (p: BrandProfile, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`"${p.label}" 프로필을 삭제할까요?`)) return;
      try {
        const res = await fetch(`/api/brand/profiles?id=${encodeURIComponent(p.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "삭제 실패");
        }
        toast.success("프로필이 삭제되었습니다.");
        fetchProfiles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "삭제 실패";
        toast.error(msg);
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
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${isEdit ? "수정" : "등록"} 실패`);
        }
        toast.success(`프로필이 ${isEdit ? "수정" : "등록"}되었습니다.`);
        await fetchProfiles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "저장 실패";
        toast.error(msg);
        throw err;
      }
    },
    [editing, fetchProfiles]
  );

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">브랜드 프로필</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            글에 사용할 브랜드 프로필을 선택하세요
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCreate} className="gap-1">
          <Plus className="h-4 w-4" />새 등록
        </Button>
      </div>

      {loading && profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : profiles.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            등록된 프로필이 없습니다. 우측 상단의 [+ 새 등록] 버튼으로 추가하세요.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => {
            const selected = selectedProfileId === p.id;
            return (
              <Card
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`cursor-pointer transition-all duration-200 ${
                  selected
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:ring-1 hover:ring-muted-foreground/30"
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{p.label || p.name}</CardTitle>
                    </div>
                    {selected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary"
                      >
                        <Check className="h-3.5 w-3.5 text-primary-foreground" />
                      </motion.div>
                    )}
                  </div>
                  {p.category && (
                    <CardDescription className="text-xs">{p.category}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {p.oneLine && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {p.oneLine}
                    </p>
                  )}
                  <div className="flex gap-1 pt-2">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => handleEdit(p, e)}>
                      <Pencil className="mr-1 h-3 w-3" />수정
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={(e) => handleDelete(p, e)}>
                      <Trash2 className="mr-1 h-3 w-3" />삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BrandProfileForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </section>
  );
}
