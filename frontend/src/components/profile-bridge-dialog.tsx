"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export type BridgeDirection = "brand-to-aeo" | "aeo-to-brand";

interface ProfileBridgeDialogProps {
  open: boolean;
  direction: BridgeDirection;
  /** 방금 저장한 프로필 이름 (제목에 표시) */
  sourceName: string;
  /** "다른 프로필 만들기" 버튼 클릭 시 호출 — 부모는 짝 양식을 prefill 상태로 연다 */
  onConfirm: () => void;
  onClose: () => void;
}

const COPY = {
  "brand-to-aeo": {
    savedLabel: "브랜드 프로필",
    targetLabel: "AEO 프로필",
    confirmButton: "AEO 만들기",
  },
  "aeo-to-brand": {
    savedLabel: "AEO 프로필",
    targetLabel: "브랜드 프로필",
    confirmButton: "브랜드 만들기",
  },
} as const;

/**
 * 한쪽 프로필 신규 등록 직후 띄우는 공용 안내 Dialog.
 *
 * "다른 쪽 프로필도 만드시겠어요?" + 공용 칸 자동 채움 안내.
 * 양방향 동일 컴포넌트, direction prop으로 텍스트만 분기.
 */
export function ProfileBridgeDialog({
  open,
  direction,
  sourceName,
  onConfirm,
  onClose,
}: ProfileBridgeDialogProps) {
  const copy = COPY[direction];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            &quot;{sourceName || "프로필"}&quot; {copy.savedLabel} 저장 완료
          </DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">
            {copy.targetLabel}도 만드시겠어요?
            <br />
            공용 칸(이름·분야·한 줄 소개·금기 단어)은{" "}
            <strong>자동으로 채워드립니다.</strong>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={onConfirm} className="gap-1">
            <Sparkles className="h-4 w-4" />
            {copy.confirmButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
