"use client";

// 유튜브 워크플로 자체 내부 스텝퍼. 블로그앱 상단 스텝퍼와 같은 토큰(primary/muted)으로 스타일.
// 모드(Card A/B)에 따라 단계가 달라지고, 지나온 단계는 클릭해 되돌아갈 수 있다.

import { Check } from "lucide-react";
import { useYt, stepsForMode } from "./state";

export function Stepper() {
  const { state, update } = useYt();
  const steps = stepsForMode(state.mode);
  const currentIndex = steps.findIndex((s) => s.screen === state.screen);

  // 모드 선택/진행/미리보기 등 스텝 목록에 없는 화면에선 스텝퍼 숨김.
  if (currentIndex < 0) return null;

  return (
    <nav className="mb-10">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;
          const canJump = index < currentIndex;

          return (
            <li
              key={step.screen}
              className="flex flex-1 items-center last:flex-none"
            >
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && update({ screen: step.screen })}
                aria-current={isActive ? "step" : undefined}
                className={`flex flex-col items-center gap-2 rounded-lg p-1 transition-all ${
                  canJump
                    ? "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    : "cursor-default"
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm transition-all duration-300 ${
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
                        : "border-muted bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`hidden text-xs whitespace-nowrap transition-colors sm:inline-block ${
                    isActive
                      ? "font-semibold text-primary"
                      : isCompleted
                        ? "font-medium text-foreground"
                        : "font-medium text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={`mx-2 mt-[-1.5rem] h-0.5 flex-1 transition-colors duration-300 ${
                    index < currentIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
