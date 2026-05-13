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
import { AlertTriangle } from "lucide-react";

interface SourceWarningModalProps {
  open: boolean;
  /** "그대로 진행" — 사용자가 출처 없이 가기로 결정 */
  onProceedAnyway: () => void;
  /** "돌아가서 입력" — 모달 닫고 입력 화면에 남음 */
  onGoBack: () => void;
}

/**
 * AEO 모드 — 출처 누락 시 경고 모달.
 *
 * Step 2(Settings) 단계에서 [출처/근거] 필드를 비운 채 "다음" 버튼을 누르면 표시.
 * - 사용자가 의도적으로 출처 없이 가는 건 허용 (강제 차단 X)
 * - 단, 비우면 AEO 인용률이 크게 떨어질 수 있다는 사실은 명확히 안내
 */
export function SourceWarningModal({
  open,
  onProceedAnyway,
  onGoBack,
}: SourceWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onGoBack()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>출처·근거 없이 진행하시겠어요?</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            AEO 글에서 <b>외부 출처·근거 인용</b>은 AI(ChatGPT·Claude·Perplexity)가
            우리 글을 신뢰할 만한 정보로 인식하는 데 가장 강력한 신호입니다.
            <br /><br />
            출처 없이 글을 발행하면 AI 인용률이 크게 떨어질 수 있어요.
            식약처·연구 자료·공식 발표 URL 또는 메모를 하나라도 넣으시는 걸 권장드립니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
          💡 <b>출처 예시</b>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            <li>식약처 의약외품 고시 페이지 URL</li>
            <li>관련 연구·논문 링크 (PubMed, Cochrane 등)</li>
            <li>공식 협회·학회 가이드라인</li>
            <li>제조사 공식 임상 결과 페이지</li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onGoBack}>
            돌아가서 입력
          </Button>
          <Button variant="default" onClick={onProceedAnyway}>
            그대로 진행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
