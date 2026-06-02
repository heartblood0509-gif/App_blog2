"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight,
  Package,
  Pencil,
  Trash2,
  Check,
  X,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";
import type { BlogDraft } from "@/types";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yy}.${mm}.${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 저장 다이얼로그 — 제목(자동 기본값) + 메모
// ─────────────────────────────────────────────────────────────────────────────

interface SaveDraftDialogProps {
  open: boolean;
  /** 자동 조합된 기본 제목 */
  defaultName: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (name: string, memo: string) => void;
}

export function SaveDraftDialog({
  open,
  defaultName,
  saving = false,
  onClose,
  onSave,
}: SaveDraftDialogProps) {
  const [name, setName] = useState(defaultName);
  const [memo, setMemo] = useState("");

  // 다이얼로그가 열릴 때 기본값으로 초기화 — 이펙트 대신 렌더 중 상태 조정(React 권장 패턴).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(defaultName);
      setMemo("");
    }
  }

  const handleSave = () => {
    const finalName = name.trim() || defaultName || "제목 없는 글";
    onSave(finalName, memo.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>보관함에 저장</DialogTitle>
          <DialogDescription>
            작성 중인 글과 이미지를 내 PC에 저장해 두고 나중에 이어서 작업할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="draft-name">제목</Label>
            <Input
              id="draft-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="저장할 제목"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="draft-memo">메모 (선택)</Label>
            <Input
              id="draft-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 톤 더 부드럽게 다시 쓸 것"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Check className="h-4 w-4" />
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 보관함 목록(공용) — 글쓰기 화면 모달과 "내 정보" 설정 패널이 함께 사용.
// ─────────────────────────────────────────────────────────────────────────────

export interface DraftListProps {
  drafts: BlogDraft[];
  /** 저장공간이 거의 찼을 때 안내 배너 표시 */
  storageWarning?: boolean;
  /** 이어하기 버튼 라벨 (설정 화면에선 "이어서 작성하기" 등으로 커스텀) */
  loadLabel?: string;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string, memo: string) => void;
  onExport: (id: string) => void;
}

export function DraftList({
  drafts,
  storageWarning = false,
  loadLabel = "이어하기",
  onLoad,
  onDelete,
  onRename,
  onExport,
}: DraftListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const startEdit = (d: BlogDraft) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditMemo(d.memo ?? "");
  };
  const commitEdit = () => {
    if (editingId) {
      onRename(editingId, editName.trim() || "제목 없는 글", editMemo.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {storageWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>저장공간이 거의 찼어요. 오래된 글을 정리해 주세요.</span>
        </div>
      )}

      {drafts.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          저장된 글이 없습니다. 글 생성 화면에서 「보관함에 저장」을 눌러 보세요.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
            >
              {editingId === d.id ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="제목"
                    autoFocus
                  />
                  <Input
                    value={editMemo}
                    onChange={(e) => setEditMemo(e.target.value)}
                    placeholder="메모 (선택)"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                      className="gap-1"
                    >
                      <X className="h-4 w-4" />
                      취소
                    </Button>
                    <Button size="sm" onClick={commitEdit} className="gap-1">
                      <Check className="h-4 w-4" />
                      확인
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    {d.memo && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {d.memo}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(d.updatedAt)}</span>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" />
                        {d.slotIds.length}장
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => onLoad(d.id)}
                      className="gap-1"
                    >
                      <ArrowRight className="h-4 w-4" />
                      {loadLabel}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport(d.id)}
                      className="gap-1"
                      title="ZIP으로 내보내기"
                    >
                      <Package className="h-4 w-4" />
                      ZIP
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(d)}
                      title="이름·메모 변경"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(d.id)}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 보관함 목록 모달 (글쓰기 화면용)
// ─────────────────────────────────────────────────────────────────────────────

interface DraftLibraryModalProps {
  open: boolean;
  drafts: BlogDraft[];
  storageWarning?: boolean;
  onClose: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string, memo: string) => void;
  onExport: (id: string) => void;
}

export function DraftLibraryModal({
  open,
  drafts,
  storageWarning = false,
  onClose,
  onLoad,
  onDelete,
  onRename,
  onExport,
}: DraftLibraryModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>보관함</DialogTitle>
          <DialogDescription>
            저장해 둔 글을 이어서 작업하거나, ZIP으로 내보낼 수 있어요. (내 PC에만 저장됨)
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          <DraftList
            drafts={drafts}
            storageWarning={storageWarning}
            onLoad={onLoad}
            onDelete={onDelete}
            onRename={onRename}
            onExport={onExport}
          />
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
