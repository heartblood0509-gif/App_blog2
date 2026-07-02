"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Pencil, Trash2, Check, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { BrandProfile } from "@/types/brand";
import type { AeoProfile } from "@/types/aeo";
import { BrandProfileForm } from "./brand-profile-form";
import { BrandProfileAssistant } from "./brand-profile-assistant";
import { AeoProfileAssistant } from "@/components/aeo/aeo-profile-assistant";
import { ProfileBridgeDialog } from "@/components/profile-bridge-dialog";
import { ProfileBundleDialog } from "@/components/profile-bundle-dialog";
import { StoreCorruptPanel } from "@/components/store-corrupt-panel";
import { fetchStoreList, StoreCorruptError } from "@/lib/store-fetch";
import { mutateProfileStore } from "@/lib/stores/profile-mutate";
import { useProfileRefetch } from "@/lib/sync/use-profile-refetch";
import {
  copyBrandToAeoPrefill,
  hasCounterpartProfile,
} from "@/lib/profile-bridge";

interface BrandProfileSectionProps {
  selectedProfileId: string | null;
  onSelect: (profileId: string) => void;
}

export function BrandProfileSection({ selectedProfileId, onSelect }: BrandProfileSectionProps) {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrandProfile | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [corrupt, setCorrupt] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);

  // ── 양방향 연동 상태 ──
  /** 짝 프로필 안내 Dialog */
  const [bridgeOpen, setBridgeOpen] = useState(false);
  /** Dialog가 가리키는 source 브랜드 프로필 (방금 저장한 것) */
  const [bridgeSource, setBridgeSource] = useState<BrandProfile | null>(null);
  /** AEO 어시스턴트 (브랜드 → AEO 다리에서 열림 — 빈 칸만 단계별 인터뷰) */
  const [aeoAssistantOpen, setAeoAssistantOpen] = useState(false);
  /** AEO 어시스턴트에 전달할 prefill 데이터 */
  const [aeoPrefill, setAeoPrefill] = useState<Partial<Omit<AeoProfile, "id">> | null>(null);

  const fetchProfiles = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await fetchStoreList<BrandProfile>("/api/brand/profiles");
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
  useProfileRefetch("brand", formOpen, fetchProfiles);

  /**
   * 짝 프로필(AEO) 안내 Dialog 트리거.
   * 신규 브랜드 저장 직후에만 호출. AEO 측에 같은 이름이 이미 있으면 띄우지 않음.
   */
  const triggerBridgeIfNeeded = useCallback(async (savedBrand: BrandProfile) => {
    try {
      const res = await fetch("/api/aeo/profiles", { cache: "no-store" });
      if (!res.ok) return;
      const aeoList = (await res.json()) as AeoProfile[];
      if (!Array.isArray(aeoList)) return;
      if (hasCounterpartProfile(savedBrand.name, aeoList)) return;
      setBridgeSource(savedBrand);
      setBridgeOpen(true);
    } catch {
      // 안내 띄우지 못해도 본 흐름엔 영향 없음
    }
  }, []);

  const handleCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  // AI 도우미가 저장 성공 시 — 목록 갱신 + 새 프로필 자동 선택 + 짝 Dialog
  const handleAssistantSaved = useCallback(
    (saved: BrandProfile) => {
      fetchProfiles();
      if (saved?.id) onSelect(saved.id);
      void triggerBridgeIfNeeded(saved);
    },
    [fetchProfiles, onSelect, triggerBridgeIfNeeded]
  );

  const handleEdit = useCallback((p: BrandProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(p);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (p: BrandProfile, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`"${p.name}" 프로필을 삭제할까요?`)) return;
      try {
        const res = await mutateProfileStore(`/api/brand/profiles?id=${encodeURIComponent(p.id)}`, {
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
        const res = await mutateProfileStore(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${isEdit ? "수정" : "등록"} 실패`);
        }
        const saved = (await res.json().catch(() => null)) as BrandProfile | null;
        toast.success(`프로필이 ${isEdit ? "수정" : "등록"}되었습니다.`);
        await fetchProfiles();

        // 신규 등록 직후에만 짝 AEO 안내. 수정은 트리거 안 함.
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
    setAeoPrefill(copyBrandToAeoPrefill(bridgeSource));
    setBridgeOpen(false);
    // 닫기 애니메이션 후 AEO 어시스턴트 열기 (Dialog 깜빡임 방지)
    setTimeout(() => setAeoAssistantOpen(true), 80);
  }, [bridgeSource]);

  const handleBridgeClose = useCallback(() => {
    setBridgeOpen(false);
  }, []);

  /** AEO 어시스턴트가 저장 성공 시 — 무한 양방향 트리거 방지 위해 자체 트리거는 호출 안 함 */
  const handleAeoSavedFromBridge = useCallback((saved: AeoProfile) => {
    toast.success(`AEO 프로필 "${saved.name}"이(가) 등록되었습니다.`);
  }, []);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">브랜드 프로필</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            글에 사용할 브랜드 프로필을 선택하세요
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
          kind="브랜드 프로필"
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
                      <Building2 className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{p.name}</CardTitle>
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

      <BrandProfileAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onSaved={handleAssistantSaved}
      />

      {/* 짝 AEO 프로필 안내 Dialog */}
      <ProfileBridgeDialog
        open={bridgeOpen}
        direction="brand-to-aeo"
        sourceName={bridgeSource?.name ?? ""}
        onConfirm={handleBridgeConfirm}
        onClose={handleBridgeClose}
      />

      {/* 브랜드 → AEO 다리에서 띄우는 AEO 어시스턴트 — 빈 칸만 단계별 인터뷰 */}
      <AeoProfileAssistant
        open={aeoAssistantOpen}
        prefill={aeoPrefill}
        onClose={() => {
          setAeoAssistantOpen(false);
          setAeoPrefill(null);
        }}
        onSaved={handleAeoSavedFromBridge}
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
