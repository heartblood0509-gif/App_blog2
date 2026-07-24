"use client";

// 프리뷰 "안전 영역" 표시 토글 버튼 — 제목-입력·화면소리 단계 공용.
// 회색 체크박스는 눈에 안 띄어 있는 줄도 모른다는 피드백 → 아이콘 달린 버튼으로,
// 켜지면 색이 채워져 켜짐/꺼짐이 한눈에 보이게 한다(발견성). 첫 방문은 켜진 채로 시작.

import { SquareDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export function GuideToggle({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title="휴대폰에서 잘리는 곳(점선)과 유튜브 버튼·제목이 가리는 곳(초록)을 표시해요"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
        className,
      )}
    >
      <SquareDashed className="size-3.5" />
      안전 영역
    </button>
  );
}
