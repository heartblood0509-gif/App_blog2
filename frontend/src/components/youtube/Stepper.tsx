"use client";

// 유튜브 워크플로 자체 내부 스텝퍼. 블로그앱 상단 스텝퍼와 같은 토큰(primary/muted)으로 스타일.
// 모드(Card A/B)에 따라 단계가 달라지고, 마지막 '영상 제작'(렌더)만 빼면 어떤 단계든 클릭해 자유 이동(원본과 동일).

import { Check } from "lucide-react";
import { useYt, stepsForMode } from "./state";

export function Stepper() {
  const { state, update } = useYt();
  const steps = stepsForMode(state.mode);
  // "영상 제작"처럼 한 스텝이 여러 화면(progress→completed 등)을 거치는 경우 match 로도 매칭.
  const currentIndex = steps.findIndex(
    (s) => s.screen === state.screen || s.match?.includes(state.screen),
  );

  // 모드 선택 등 스텝 목록에 없는 화면에선 스텝퍼 숨김.
  if (currentIndex < 0) return null;

  // 마지막 = '영상 제작'(렌더) 단계. 원본 step-render 와 동일하게 스텝 클릭으론 못 가고 "영상 만들기" 버튼으로만 진입.
  const lastIndex = steps.length - 1;
  // 렌더 "진행 중"(progress)에만 스텝 이동을 잠근다 — 이탈하면 SSE 구독이 끊겨 완료를 못 받기 때문.
  // 완료(completed) 화면에선 원본처럼 이전 단계로 클릭 복귀를 허용한다. (원본은 렌더가 별도 페이지라 이 잠금이 불필요.)
  const isRendering = state.screen === "progress";

  return (
    <nav className="mb-10">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          // 진행 표시(장식): 도달한 최대 단계 이전을 완료로 칠한다(원본 updateTimeline: i < maxReachedStep).
          // 뒤로 가도 지나온 점이 회색으로 풀리지 않게 maxStepReached 기준(현재 단계는 active 로 빠짐).
          const isCompleted = index < state.maxStepReached && index !== currentIndex;
          // 원본 clickTimelineStep 규칙: 마지막 '영상 제작'만 제외하고, 완료/방문 여부와 무관하게 자유 이동. 진행 중엔 잠금.
          const canJump =
            index !== lastIndex && index !== currentIndex && !isRendering;

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
                    index < state.maxStepReached ? "bg-primary" : "bg-muted"
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
