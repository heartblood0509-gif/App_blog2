"use client";

// 아직 구현되지 않은 화면용 자리표시. 상단 스텝퍼로 이전 단계로 돌아갈 수 있다.

import { Hammer } from "lucide-react";
import { useYt } from "../state";

export function Placeholder({ label }: { label: string }) {
  const { update } = useYt();
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <Hammer className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-base font-semibold">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        이 단계는 다음 마일스톤에서 구현됩니다.
      </p>
      <button
        type="button"
        onClick={() => update({ screen: "mode", mode: null })}
        className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
      >
        ← 모드 선택으로
      </button>
    </div>
  );
}
