"use client";

// 진입 화면 — "AI가 모두 생성"(Card A) vs "내가 직접 제공"(Card B) 선택.

import { Sparkles, PenTool } from "lucide-react";
import { useYt } from "../state";

export function ModeSelect() {
  const { update } = useYt();

  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold">어떻게 만들까요?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        대본·이미지·영상을 AI에 맡길지, 직접 제공할지 골라주세요.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => update({ mode: "ai_full", screen: "topic" })}
          className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center transition-all hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold">AI가 모두 생성</h3>
          <p className="text-sm text-muted-foreground">
            주제만 입력하면 제목·나레이션·이미지·영상까지 AI가 자동으로 만들어줍니다.
          </p>
        </button>

        <button
          type="button"
          onClick={() => update({ mode: "user_assets", screen: "script" })}
          className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center transition-all hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PenTool className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold">내가 직접 제공</h3>
          <p className="text-sm text-muted-foreground">
            이미 가지고 있는 대본을 입력하고, 줄마다 이미지·영상을 올리거나 AI에 맡길 수 있어요.
          </p>
        </button>
      </div>
    </div>
  );
}
