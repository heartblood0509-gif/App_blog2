"use client";

// 유튜브 워크플로 자체 내부 스텝퍼. 블로그앱 상단 스텝퍼와 같은 토큰(primary/muted)으로 스타일.
// 모드(Card A/B)에 따라 단계가 달라지고, 마지막 '영상 제작'(렌더)만 빼면 어떤 단계든 클릭해 자유 이동(원본과 동일).

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useYt, stepsForMode, restorePatchFromDraft } from "./state";
import type { YtScreen } from "./state";
import { reopenJob } from "@/lib/youtube/endpoints";

export function Stepper() {
  const { state, update } = useYt();
  // 완료된 카드 B 작업에서 이전 단계로 되돌아가는 중(reopen 진행)인 대상 화면.
  // null 이 아니면 스텝퍼 전체를 잠그고 해당 단계 동그라미에 스피너를 표시한다.
  const [reopening, setReopening] = useState<YtScreen | null>(null);

  // 완료(completed) 화면에서 이전 단계로 점프할 때: 백엔드 작업을 편집 가능(preview_ready)
  // 상태로 되돌리고(reopen), 응답 DraftState 로 프론트 state 를 재수화한 뒤 이동한다.
  // (작업이력/실패복귀와 동일한 reopen+restore 메커니즘.) 그 외 이동은 화면만 전환.
  async function goToStep(target: YtScreen, jumpable: boolean) {
    if (!jumpable || reopening) return;
    // 대본 단계에서 고친 텍스트를 아직 반영(쪼개기/다음)하지 않았으면, 이동 시 그 편집이 사라진다.
    // 사용자가 "수정했다"고 착각한 채 옛 대본으로 영상이 만들어지는 것을 막기 위해 먼저 알려준다.
    if (state.screen === "script" && state.scriptDraftDirty) {
      const ok = window.confirm(
        "고친 대본이 아직 반영되지 않았어요. 지금 다른 단계로 이동하면 수정한 내용이 사라집니다.\n\n반영하려면 '문장으로 쪼개기'(대본을 바꿨을 때) 또는 '다음' 버튼을 먼저 눌러주세요.\n\n그래도 이동할까요?",
      );
      if (!ok) return;
      update({ scriptDraftDirty: false }); // 편집 버림을 확정 — 다음 진입까지 재경고 방지
    }
    const jobId = state.jobId;
    const needsReopen =
      state.mode === "user_assets" && state.screen === "completed" && !!jobId;
    if (!needsReopen || !jobId) {
      update({ screen: target });
      return;
    }
    setReopening(target);
    try {
      const ds = await reopenJob(jobId);
      // restorePatchFromDraft 는 screen:"lines"·maxStepReached:1 로 고정하므로,
      // 클릭한 단계로 덮어쓰고 지나온 진행도(maxStepReached)는 유지한다.
      update({
        ...restorePatchFromDraft(jobId, ds),
        screen: target,
        maxStepReached: state.maxStepReached,
      });
      toast.info("수정 모드로 전환했어요 — 다시 만들면 영상이 새로 만들어져요");
    } catch (e) {
      // 410(다운로드/정리됨)·409(진행 중) 등은 백엔드가 친절한 한국어 사유를 준다.
      toast.error(
        e instanceof Error ? e.message : "편집 화면으로 돌아가지 못했어요.",
      );
    } finally {
      setReopening(null);
    }
  }

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
                disabled={!canJump || reopening !== null}
                onClick={() => goToStep(step.screen, canJump)}
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
                  {reopening === step.screen ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
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
