"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getImageFromClipboardEvent } from "@/lib/image/clipboard";

/**
 * 이미지 슬롯 클릭 시 뜨는 소스 선택 팝업.
 * - 붙여넣기: 팝업이 열린 동안 OS 단축키(⌘V / Ctrl+V)를 누르면 클립보드 이미지가 들어옴
 *   (document 레벨 paste 리스너 — 어디에 포커스가 있든 잡힘, 권한 불필요)
 * - 파일에서 선택: 호출부의 파일창 열기(onUpload)
 * 성공 시 onPasteFile(file)을 부르고 팝업을 닫는다.
 */
export function ImageSourceDialog({
  open,
  onOpenChange,
  onUpload,
  onPasteFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: () => void;
  onPasteFile: (file: File) => void;
}) {
  // 팝업이 열린 동안만 paste 단축키를 받는다
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const file = getImageFromClipboardEvent(e);
      if (file) {
        e.preventDefault();
        onPasteFile(file);
        onOpenChange(false);
      } else {
        toast.error("클립보드에 이미지가 없어요");
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [open, onPasteFile, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>이미지 추가</DialogTitle>
          <DialogDescription>
            복사한 이미지를{" "}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
              Ctrl + V
            </kbd>{" "}
            로 붙여넣거나, 파일에서 선택하세요.
          </DialogDescription>
        </DialogHeader>

        <Button
          variant="outline"
          className="justify-start gap-2"
          onClick={() => {
            onUpload();
            onOpenChange(false);
          }}
        >
          <FolderOpen className="h-4 w-4" />
          파일에서 선택
        </Button>
      </DialogContent>
    </Dialog>
  );
}
