"use client";

// 작업 진행 화면. SSE 로 상태/진행률을 받아 그리고, 단계 전환 상태에서 다음 화면으로 라우팅한다.
// Card A(kenburns): pending→generating_images→preview_ready(→이미지확인) ... 확인 후 awaiting_confirmation→rendering→completed.
// preview_ready→'preview', clips_ready→'clips', completed→'completed'. failed 는 인라인 에러+처음부터.

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { freshYtState, restorePatchFromDraft, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import { reopenJob } from "@/lib/youtube/endpoints";
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
  const [reopening, setReopening] = useState(false);
  const routedRef = useRef(false);

  useJobStream(state.jobId, (f) => {
    setFrame(f);
    if (routedRef.current) return;
    // preview_ready 확인 화면(ImagePreview)은 Card A 전용. Card B 는 confirm 직후
    // (이미 awaiting_confirmation) 진입하므로 정상 흐름엔 안 닿지만, 만일을 대비한 가드.
    if (f.status === "preview_ready" && state.mode !== "user_assets") {
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
    update(freshYtState());
  }

  // 카드 B 렌더 실패 후 편집 화면(lines)으로 복귀. 자산·음성·제목이 보존돼 있어
  // 짧았던 영상만 교체 후 다시 제작할 수 있다. reopenJob 이 자산을 복원하고 status 를
  // preview_ready 로 되돌린다. restorePatchFromDraft 가 screen 을 "lines" 로 라우팅.
  async function reopenForEdit() {
    if (!state.jobId || reopening) return;
    setReopening(true);
    try {
      const ds = await reopenJob(state.jobId);
      update(restorePatchFromDraft(state.jobId, ds));
    } catch (e) {
      // 활성 task 등으로 409 면 백엔드의 한국어 안내 메시지가 그대로 노출된다(잠시 후 재시도).
      toast.error(e instanceof Error ? e.message : "편집 화면으로 돌아가지 못했어요.");
    } finally {
      setReopening(false);
    }
  }

  if (status === "failed") {
    const errMsg = frame?.error || frame?.task_error || "작업이 실패했습니다.";
    const canReopen = state.mode === "user_assets" && !!state.jobId;
    // Windows 애플리케이션 제어(Smart App Control) 차단은 원인·해결이 분명하므로
    // 밋밋한 한 줄 대신 단계별 해제 안내로 승격한다. 백엔드가 문구에 "Smart App Control"
    // 표식을 담아 내려준다(youtube-backend/core/app_control.py).
    const isSacBlocked = errMsg.includes("Smart App Control");
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-destructive">영상 생성 실패</h2>
            {isSacBlocked ? (
              <div className="mt-2 space-y-2.5 text-sm">
                <p className="text-foreground">
                  Windows 11의 보안 기능(Smart App Control)이 이 앱의 영상·소리 처리 도구 실행을 막았습니다. 최근 PC를 포맷하거나 새로 설치하면 이 기능이 자동으로 켜져 발생할 수 있어요.
                </p>
                <p className="text-foreground">
                  Windows는 새로 설치한 직후엔 이 기능을 잠시 지켜보며 스스로 켜거나 꺼주기도 하지만, 이미 켜져서 차단이 생긴 상태에서는 저절로 꺼지지 않아요. 아래처럼 직접 꺼주세요.
                </p>
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">해결 방법</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="rounded border border-border bg-muted/40 px-2 py-0.5">Windows 보안</span>
                    <span className="text-muted-foreground">›</span>
                    <span className="rounded border border-border bg-muted/40 px-2 py-0.5">앱 및 브라우저 컨트롤</span>
                    <span className="text-muted-foreground">›</span>
                    <span className="rounded border border-border bg-muted/40 px-2 py-0.5">Smart App Control</span>
                    <span className="text-muted-foreground">›</span>
                    <span className="rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-medium text-destructive">끔</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  ※ 나중에 같은 경로에서 다시 켤 수 있어요. 회사에서 관리하는 PC라면 관리자에게 문의하세요. 다음 업데이트에서 정식 서명이 적용되면 이 안내 없이도 됩니다.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{errMsg}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {canReopen && (
            <Button onClick={reopenForEdit} disabled={reopening} className="gap-2">
              {reopening ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              돌아가서 수정
            </Button>
          )}
          <Button variant="outline" onClick={restart} disabled={reopening} className="gap-2">
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
