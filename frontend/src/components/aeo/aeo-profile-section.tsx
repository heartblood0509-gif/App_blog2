"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Pencil, Trash2, Check, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { AeoProfile } from "@/types/aeo";
import type { BrandProfile } from "@/types/brand";
import { AeoProfileForm } from "./aeo-profile-form";
import { AeoProfileAssistant } from "./aeo-profile-assistant";
import { BrandProfileAssistant } from "@/components/brand/brand-profile-assistant";
import { ProfileBridgeDialog } from "@/components/profile-bridge-dialog";
import { ProfileBundleDialog } from "@/components/profile-bundle-dialog";
import { StoreCorruptPanel } from "@/components/store-corrupt-panel";
import { fetchStoreList, StoreCorruptError } from "@/lib/store-fetch";
import { mutateProfileStore } from "@/lib/stores/profile-mutate";
import { useProfileRefetch } from "@/lib/sync/use-profile-refetch";
import {
  copyAeoToBrandPrefill,
  hasCounterpartProfile,
} from "@/lib/profile-bridge";

interface AeoProfileSectionProps {
  selectedProfileId: string | null;
  onSelect: (profileId: string) => void;
}

export function AeoProfileSection({ selectedProfileId, onSelect }: AeoProfileSectionProps) {
  const [profiles, setProfiles] = useState<AeoProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AeoProfile | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [corrupt, setCorrupt] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);

  // ── 양방향 연동 상태 ──
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeSource, setBridgeSource] = useState<AeoProfile | null>(null);
  const [brandAssistantOpen, setBrandAssistantOpen] = useState(false);
  const [brandPrefill, setBrandPrefill] = useState<Partial<Omit<BrandProfile, "id">> | null>(null);

  const fetchProfiles = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await fetchStoreList<AeoProfile>("/api/aeo/profiles");
      setProfiles(data);
      setCorrupt(false);
    } catch (err) {
      if (err instanceof StoreCorruptError) {
        setCorrupt(true);
      } else {
        toast.error(err instanceof Error ? err.message : "오류");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // 다른 기기의 변경이 실시간 반영되면 조용히 재조회(단, 편집 폼 열림 중엔 미룸).
  useProfileRefetch("aeo", formOpen, fetchProfiles);

  /**
   * 짝 브랜드 프로필 안내 Dialog 트리거.
   * 신규 AEO 저장 직후에만 호출. 브랜드 측에 같은 이름이 이미 있으면 띄우지 않음.
   */
  const triggerBridgeIfNeeded = useCallback(async (savedAeo: AeoProfile) => {
    try {
      const res = await fetch("/api/brand/profiles", { cache: "no-store" });
      if (!res.ok) return;
      const brandList = (await res.json()) as BrandProfile[];
      if (!Array.isArray(brandList)) return;
      if (hasCounterpartProfile(savedAeo.name, brandList)) return;
      setBridgeSource(savedAeo);
      setBridgeOpen(true);
    } catch {
      // 안내 띄우지 못해도 본 흐름엔 영향 없음
    }
  }, []);

  const handleCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((p: AeoProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(p);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (p: AeoProfile, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`"${p.label}" 프로필을 삭제할까요?`)) return;
      try {
        const res = await mutateProfileStore(`/api/aeo/profiles?id=${encodeURIComponent(p.id)}`, {
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
    async (payload: Omit<AeoProfile, "id">) => {
      try {
        const isEdit = editing !== null;
        const url = isEdit
          ? `/api/aeo/profiles?id=${encodeURIComponent(editing!.id)}`
          : `/api/aeo/profiles`;
        const method = isEdit ? "PUT" : "POST";
        const res = await mutateProfileStore(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${isEdit ? "수정" : "등록"} 실패`);
        }
        const saved = (await res.json().catch(() => null)) as AeoProfile | null;
        toast.success(`프로필이 ${isEdit ? "수정" : "등록"}되었습니다.`);
        await fetchProfiles();

        // 신규 등록 직후에만 짝 브랜드 안내. 수정은 트리거 안 함.
        if (!isEdit && saved) {
          void triggerBridgeIfNeeded(saved);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "저장 실패";
        toast.error(msg);
        throw err;
      }
    },
    [editing, fetchProfiles, triggerBridgeIfNeeded]
  );

  // ── 양방향 연동 핸들러 ──

  const handleBridgeConfirm = useCallback(() => {
    if (!bridgeSource) return;
    setBrandPrefill(copyAeoToBrandPrefill(bridgeSource));
    setBridgeOpen(false);
    setTimeout(() => setBrandAssistantOpen(true), 80);
  }, [bridgeSource]);

  const handleBridgeClose = useCallback(() => {
    setBridgeOpen(false);
  }, []);

  /** 브랜드 어시스턴트가 저장 성공 시 — 무한 양방향 트리거 방지 위해 자체 트리거는 호출 안 함 */
  const handleBrandSavedFromBridge = useCallback((saved: BrandProfile) => {
    toast.success(`브랜드 프로필 "${saved.name}"이(가) 등록되었습니다.`);
  }, []);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">AEO 프로필</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI가 신뢰할 권위·신원 프로필을 선택하세요 (AI 답변에 인용되는 글을 위해)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setAssistantOpen(true)}
            className="gap-1"
          >
            <Wand2 className="h-4 w-4" />AI 도움받기
          </Button>
          <Button variant="outline" size="sm" onClick={handleCreate} className="gap-1">
            <Plus className="h-4 w-4" />새 등록 (직접)
          </Button>
        </div>
      </div>

      {corrupt ? (
        <StoreCorruptPanel
          kind="AEO 프로필"
          onRetry={() => void fetchProfiles()}
          onImport={() => setBundleOpen(true)}
        />
      ) : loading && profiles.length === 0 ? (
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
                      <Sparkles className="h-5 w-5 text-primary" />
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
                  {p.oneLineIntro && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {p.oneLineIntro}
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

      <AeoProfileForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <AeoProfileAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onSaved={(saved) => {
          // 새로 저장된 프로필을 즉시 선택 + 목록 갱신 + 짝 Dialog
          onSelect(saved.id);
          fetchProfiles();
          void triggerBridgeIfNeeded(saved);
        }}
      />

      {/* 짝 브랜드 프로필 안내 Dialog */}
      <ProfileBridgeDialog
        open={bridgeOpen}
        direction="aeo-to-brand"
        sourceName={bridgeSource?.name ?? ""}
        onConfirm={handleBridgeConfirm}
        onClose={handleBridgeClose}
      />

      {/* AEO → 브랜드 다리에서 띄우는 브랜드 어시스턴트 — 빈 칸만 단계별 인터뷰 */}
      <BrandProfileAssistant
        open={brandAssistantOpen}
        prefill={brandPrefill}
        onClose={() => {
          setBrandAssistantOpen(false);
          setBrandPrefill(null);
        }}
        onSaved={handleBrandSavedFromBridge}
      />

      {/* 저장소 손상 시 복구용 — 백업 파일에서 복원 진입 */}
      <ProfileBundleDialog
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
        onImported={() => void fetchProfiles()}
      />
    </section>
  );
}
