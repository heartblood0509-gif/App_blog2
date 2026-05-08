"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface TemplateFitModalProps {
  open: boolean;
  /** AI가 알려준 미스매치 사유 */
  reason: string;
  /** AI가 추천한 대체 주제 0~3개 */
  suggestions: string[];
  /** 사용자가 선택한 추천 주제로 진행 */
  onAcceptSuggestion: (picked: string) => void;
  /** 이전 단계로 돌아가서 직접 수정 */
  onGoBack: () => void;
  /** 그냥 진행 (사용자 오버라이드) */
  onProceedAnyway: () => void;
  onOpenChange?: (open: boolean) => void;
}

const NUM_LABELS = ["①", "②", "③"];

/**
 * 검문소 모달 — 3개 추천 주제 중 1개 선택 또는 다른 액션.
 */
export function TemplateFitModal({
  open,
  reason,
  suggestions,
  onAcceptSuggestion,
  onGoBack,
  onProceedAnyway,
  onOpenChange,
}: TemplateFitModalProps) {
  const validSuggestions = suggestions.filter((s) => s.trim().length > 0).slice(0, 3);
  const hasSuggestions = validSuggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            잠깐만요 — 설정이 안 어울려요
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-foreground">
            {reason || "선택한 템플릿과 입력한 주제가 잘 어울리지 않아 보입니다."}
          </DialogDescription>
        </DialogHeader>

        {hasSuggestions && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-amber-700 dark:text-amber-300">
              💡 추천 주제 — 마음에 드는 걸 골라주세요
            </div>
            <div className="flex flex-col gap-2">
              {validSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAcceptSuggestion(s)}
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-sm transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:hover:bg-amber-900/40"
                >
                  <span className="mr-2 font-medium text-amber-700 dark:text-amber-300">
                    {NUM_LABELS[i] ?? `${i + 1}.`}
                  </span>
                  <span className="text-foreground">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch sm:justify-stretch">
          <Button
            variant="outline"
            onClick={onGoBack}
            className="w-full"
          >
            이전 단계로 돌아가서 직접 수정하기
          </Button>
          <Button
            variant="ghost"
            onClick={onProceedAnyway}
            className="w-full text-muted-foreground"
          >
            그냥 진행 (어색할 수 있어요)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
