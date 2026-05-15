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
import { Lightbulb } from "lucide-react";

interface EmptyInputsWarningModalProps {
  open: boolean;
  onClose: () => void;
}

export function EmptyInputsWarningModal({
  open,
  onClose,
}: EmptyInputsWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <DialogTitle>잠깐, AI에게 줄 단서가 없어요</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            어떤 정보든 1줄만이라도 힌트를 주세요.
            <br />
            많은 정보를 줄수록 AI가 원하는 글을 써드립니다.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            알겠어요
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
