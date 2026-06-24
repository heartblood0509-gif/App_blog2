"use client";

// 작업이력 모달 — 본인 유튜브 작업 목록을 보여주고, 작업별로 액션 버튼을 띄운다:
//  · 완성 영상 있음 → "영상 보기": 영상 재생 화면(completed)
//  · 편집 가능(can_reopen) → "편집 하기": reopen 으로 편집 상태 복귀 + state 복원 → lines 화면
//  · 진행 중 → "진행 보기": progress 화면으로 SSE 재구독
//  · 삭제(discard): 모든 산출물 제거(사용자가 직접 누를 때만). 진행 중이면 비활성(백엔드도 409).
// 완성 후 다시 열어 편집 중인 작업은 [완성][편집 중] 배지를 함께 표시한다.
// 로컬 단일사용자라 30일 제한 없이 언제든 다시 열 수 있다("받아도 계속 수정").

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Pencil, Play, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listJobs,
  reopenJob,
  discardJob,
  type JobSummary,
} from "@/lib/youtube/endpoints";
import { useYt, restorePatchFromDraft } from "./state";

// 렌더/생성 진행 중(편집 불가) 상태들 — 이 상태는 "진행 보기"로 보내고 삭제는 막는다.
const ACTIVE_STATUSES = new Set([
  "pending",
  "generating_images",
  "generating_clips",
  "generating_tts",
  "assembling_video",
  "awaiting_confirmation",
  "regenerating_image",
  "clips_ready",
]);

// 용량이 크면(>500MB) 정리 권유로 강조.
const BIG_BYTES = 500 * 1024 * 1024;

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type BadgeInfo = { label: string; variant: BadgeVariant };

function statusBadge(s: string): BadgeInfo {
  if (s === "completed") return { label: "완성", variant: "default" };
  if (s === "preview_ready") return { label: "편집 중", variant: "secondary" };
  if (s === "failed") return { label: "실패", variant: "destructive" };
  return { label: "진행 중", variant: "outline" };
}

// 한 작업에 여러 상태 맥락을 동시에 보여준다(완성 영상이 남아 있으면 "완성"을 함께 표시):
//  · 완성 후 다시 열어 편집 중(preview_ready + 영상 존재) → [완성][편집 중]
//  · 완성 후 재렌더 실패(failed + 영상 존재) → [완성][실패]
//  · 새 초안 편집 중(영상 없음) → [편집 중]
function jobBadges(j: JobSummary): BadgeInfo[] {
  const hasVideo = !!j.video_url;
  if (j.status === "failed") {
    const out: BadgeInfo[] = [];
    if (hasVideo) out.push({ label: "완성", variant: "default" });
    out.push({ label: "실패", variant: "destructive" });
    return out;
  }
  if (ACTIVE_STATUSES.has(j.status)) return [{ label: "진행 중", variant: "outline" }];
  const out: BadgeInfo[] = [];
  if (hasVideo) out.push({ label: "완성", variant: "default" });
  if (j.status === "preview_ready") out.push({ label: "편집 중", variant: "secondary" });
  return out.length ? out : [statusBadge(j.status)];
}

// 작업이력엔 ai_full 작업도 섞여 내려올 수 있어(list_jobs 미필터) mode 를 작업별로 결정한다.
function ytMode(j: JobSummary): "ai_full" | "user_assets" {
  return j.generation_mode === "ai_full" ? "ai_full" : "user_assets";
}

function fmtSize(b?: number | null): string {
  if (!b || b <= 0) return "";
  const mb = b / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.max(1, Math.round(mb))}MB`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function jobTitle(j: JobSummary): string {
  const t = (
    j.title || [j.title_line1, j.title_line2].filter(Boolean).join(" ")
  ).trim();
  return t || "(제목 없음)";
}

export function YoutubeJobHistory({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { update } = useYt();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listJobs()
      .then(setJobs)
      .catch((e) =>
        toast.error(
          e instanceof Error ? e.message : "작업 목록을 불러오지 못했어요.",
        ),
      )
      .finally(() => setLoading(false));
  }, [open]);

  // 편집 하기 — reopen 으로 편집 상태 복귀 + state 복원 → lines 화면(비동기).
  async function editJob(j: JobSummary) {
    if (busyId) return;
    setBusyId(j.job_id);
    try {
      const ds = await reopenJob(j.job_id);
      update(restorePatchFromDraft(j.job_id, ds));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "작업을 열지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  // 영상 보기 — 완성 영상을 재생하는 마지막 단계(completed)로 이동.
  function viewVideo(j: JobSummary) {
    if (busyId) return;
    update({ jobId: j.job_id, mode: ytMode(j), screen: "completed" });
    onOpenChange(false);
  }

  // 진행 보기 — 렌더/생성 진행 화면(progress)으로 SSE 재구독.
  function viewProgress(j: JobSummary) {
    if (busyId) return;
    update({ jobId: j.job_id, mode: ytMode(j), screen: "progress" });
    onOpenChange(false);
  }

  async function remove(j: JobSummary) {
    if (busyId) return;
    if (ACTIVE_STATUSES.has(j.status)) {
      toast.error("진행 중인 작업은 삭제할 수 없어요.");
      return;
    }
    if (!window.confirm("이 작업의 모든 파일을 삭제할까요? 되돌릴 수 없어요."))
      return;
    setBusyId(j.job_id);
    try {
      await discardJob(j.job_id);
      setJobs((prev) => prev.filter((x) => x.job_id !== j.job_id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>이전 작업</DialogTitle>
          <DialogDescription>
            예전 작업을 다시 열어 대본·자산을 수정하거나, 더 필요 없는 작업을
            삭제해 공간을 비울 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 불러오는 중...
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            아직 저장된 작업이 없어요.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <ul className="space-y-2">
              {jobs.map((j) => {
                const badges = jobBadges(j);
                const active = ACTIVE_STATUSES.has(j.status);
                const big = (j.size_bytes ?? 0) >= BIG_BYTES;
                const sizeText = fmtSize(j.size_bytes);
                const canViewVideo = !!j.video_url && !active;
                const busy = busyId !== null;
                return (
                  <li
                    key={j.job_id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {jobTitle(j)}
                        </span>
                        {badges.map((b, i) => (
                          <Badge key={i} variant={b.variant} className="shrink-0">
                            {b.label}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{fmtDate(j.created_at)}</span>
                        {sizeText && (
                          <span
                            className={
                              big
                                ? "font-semibold text-amber-600 dark:text-amber-500"
                                : ""
                            }
                          >
                            · {sizeText}
                            {big ? " (큼)" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {canViewVideo && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1"
                          disabled={busy}
                          onClick={() => viewVideo(j)}
                        >
                          <Eye className="h-4 w-4" /> 영상 보기
                        </Button>
                      )}
                      {active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={busy}
                          onClick={() => viewProgress(j)}
                        >
                          <Play className="h-4 w-4" /> 진행 보기
                        </Button>
                      ) : j.can_reopen ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={busy}
                          onClick={() => editJob(j)}
                        >
                          {busyId === j.job_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Pencil className="h-4 w-4" />
                          )}
                          편집 하기
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busy || active}
                        title={active ? "진행 중엔 삭제할 수 없어요" : "삭제"}
                        onClick={() => remove(j)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
