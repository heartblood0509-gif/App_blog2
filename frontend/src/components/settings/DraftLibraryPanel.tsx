"use client";

// "내 정보 → 글 보관함" 패널.
// 글쓰기 화면의 보관함과 같은 저장소(localStorage 'blogpick-drafts' + IndexedDB)를 그대로 읽는다.
// "이어서 작성하기"는 쪽지(setPendingDraft)를 남기고 메인('/')으로 이동 → 메인이 마운트 시 복원.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DraftList } from "@/components/steps/draft-library-modal";
import {
  getDraft,
  renameDraft,
  deleteDraft,
  setPendingDraft,
  subscribeDrafts,
  getDraftsSnapshot,
  getDraftsServerSnapshot,
} from "@/lib/draft-storage";
import { loadDraftImages, deleteDraftAssets } from "@/lib/image-storage";
import { exportZip } from "@/lib/export-zip";

export function DraftLibraryPanel() {
  const router = useRouter();
  // 외부 스토어 구독 — 마운트 이펙트에서 setState 하지 않고 보관함을 안전하게 읽는다.
  // 삭제·이름변경 시 writeAll → emitChange 로 목록이 자동 갱신됨.
  const drafts = useSyncExternalStore(
    subscribeDrafts,
    getDraftsSnapshot,
    getDraftsServerSnapshot,
  );
  const [storageWarning, setStorageWarning] = useState(false);

  // 저장공간 사용량(비동기)만 이펙트로 — 실제 await 이후 setState 라 안전.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
          const { usage, quota } = await navigator.storage.estimate();
          if (active && usage && quota && quota > 0) {
            setStorageWarning(usage / quota >= 0.8);
          }
        }
      } catch {
        // estimate 미지원 — 무시
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleLoad = (id: string) => {
    setPendingDraft(id);
    router.push("/");
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm("이 글을 보관함에서 삭제할까요?");
    if (!ok) return;
    deleteDraft(id); // → emitChange 로 목록 자동 갱신
    await deleteDraftAssets(id);
    toast.success("삭제했습니다.");
  };

  const handleRename = (id: string, name: string, memo: string) => {
    renameDraft(id, name, memo); // → emitChange 로 목록 자동 갱신
  };

  const handleExport = async (id: string) => {
    const draft = getDraft(id);
    if (!draft) return;
    try {
      const imgs = await loadDraftImages(id);
      const generatedImages: Record<string, string> = {};
      const mimeBySlot: Record<string, string> = {};
      for (const [sid, v] of Object.entries(imgs)) {
        generatedImages[sid] = v.base64;
        mimeBySlot[sid] = v.mimeType;
      }
      await exportZip({
        title: draft.name || draft.snapshot.selectedTitle || "블로그 글",
        content: draft.snapshot.generatedContent ?? "",
        imageSlots: draft.snapshot.imageSlots ?? [],
        generatedImages,
        mimeBySlot,
      });
      toast.success("ZIP 다운로드를 시작했습니다.");
    } catch {
      toast.error("ZIP 생성에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        작성하다 저장해 둔 글을 모아 봅니다. 「이어서 작성하기」를 누르면 글쓰기 화면으로 이동해
        본문·이미지·원본 사진까지 그대로 복원돼요. (모두 내 PC에만 저장됨)
      </p>
      <DraftList
        drafts={drafts}
        storageWarning={storageWarning}
        loadLabel="이어서 작성하기"
        onLoad={handleLoad}
        onDelete={handleDelete}
        onRename={handleRename}
        onExport={handleExport}
      />
    </div>
  );
}
