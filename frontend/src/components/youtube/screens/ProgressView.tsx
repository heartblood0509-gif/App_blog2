"use client";

// 작업 진행 화면. SSE 로 상태/진행률을 받아 그리고, 단계 전환 상태에서 다음 화면으로 라우팅한다.
// Card A(kenburns): pending→generating_images→preview_ready(→이미지확인) ... 확인 후 awaiting_confirmation→rendering→completed.
// preview_ready→'preview', clips_ready→'clips', completed→'completed'. failed 는 인라인 에러+처음부터.

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { initialYtState, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import { useJobStream, type JobFrame } from "@/lib/youtube/useJobStream";

const STATUS_LABEL: Record<string, string> = {
  pending: "작업 대기 중",
  generating_images: "이미지 생성 중",
  preview_ready: "이미지 생성 완료",
  generating_clips: "AI 클립 생성 중",
  clips_ready: "클립 생성 완료",
  awaiting_confirmation: "영상 제작 준비 중",
  rendering: "영상 조립 중",
  completed: "완성",
  failed: "실패",
};

export function ProgressView() {
  const { state, update } = useYt();
  const [frame, setFrame] = useState<JobFrame | null>(null);
  const routedRef = useRef(false);

  useJobStream(state.jobId, (f) => {
    setFrame(f);
    if (routedRef.current) return;
    if (f.status === "preview_ready") {
      routedRef.current = true;
      update({ screen: "preview" });
    } else if (f.status === "clips_ready") {
      routedRef.current = true;
      update({ screen: "clips" });
    } else if (f.status === "completed") {
      routedRef.current = true;
      update({ screen: "completed" });
    }
  });

  const status = frame?.status ?? "pending";
  const pct = Math.max(0, Math.min(100, Math.round((frame?.progress ?? 0) * 100)));
  const lines = frame?.lines ?? [];
  const doneImages = new Set(frame?.completed_images ?? []);

  function restart() {
    update({ ...initialYtState });
  }

  if (status === "failed") {
    const errMsg = frame?.error || frame?.task_error || "작업이 실패했습니다.";
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <div>
            <h2 className="text-lg font-semibold text-destructive">영상 생성 실패</h2>
            <p className="mt-1 text-sm text-muted-foreground">{errMsg}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={restart} className="gap-2">
            <RotateCcw className="h-4 w-4" /> 처음부터 다시
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <h2 className="text-lg font-semibold">{STATUS_LABEL[status] ?? "진행 중"}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {frame?.current_step ?? "준비 중..."}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Progress value={pct} className="flex-1" />
        <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>

      {lines.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-muted-foreground">
            이미지 {doneImages.size}/{lines.length}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {lines.map((l, i) => {
              const done = doneImages.has(i);
              return (
                <div
                  key={i}
                  className="aspect-[9/16] overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {done && state.jobId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합)
                    <img
                      src={ytUrl(`/api/jobs/${state.jobId}/images/${i}`)}
                      alt={`컷 ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
