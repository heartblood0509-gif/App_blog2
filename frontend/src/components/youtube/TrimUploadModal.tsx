"use client";

// 카드 B 선(先)트림 업로드 모달 — 업로드 전에 원본에서 "쓸 구간"을 고른다.
// 파일을 전송하지 않고 URL.createObjectURL 로 로컬 재생만 하며, 확정하면 부모가
// (데스크톱) 경로 임포트 또는 (웹) 파일 업로드로 그 구간(±여유분)만 잘라 저장한다.
//
// 창(window) 폭 = 나레이션 길이로 고정. 좌우로만 드래그해 "위치"만 고른다(틱톡 사운드 트림 패턴).
// 실제 저장은 앞뒤 여유분을 붙여 자르므로, 업로드 후에도 그 범위 안에서 시작점을 미세조정할 수 있다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrimUploadModal({
  open,
  file,
  neededSec,
  lineNo,
  busy = false,
  previewSrc,
  preparing = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  file: File | null;
  neededSec: number;
  lineNo: number;
  busy?: boolean;
  // 데스크톱: 백엔드가 만든 저화질 미리보기본 URL(HEVC 재생용). 없으면 로컬 파일 blob 으로 재생(웹).
  previewSrc?: string;
  // 저화질 미리보기본을 만드는 중이면 스피너 표시.
  preparing?: boolean;
  onCancel: () => void;
  onConfirm: (inSec: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-w-xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{lineNo}번 줄 · 쓸 구간 고르기</DialogTitle>
        </DialogHeader>
        {file ? (
          // 파일이 바뀌면 remount 해 내부 상태(길이/시작점/오류)를 깔끔히 초기화.
          // previewSrc/preparing 은 key 에서 제외 — 프록시가 준비돼도 remount 하지 않는다.
          <TrimInner
            key={`${file.name}:${file.size}:${file.lastModified}`}
            file={file}
            neededSec={neededSec}
            busy={busy}
            previewSrc={previewSrc}
            preparing={preparing}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TrimInner({
  file,
  neededSec,
  busy,
  previewSrc,
  preparing,
  onCancel,
  onConfirm,
}: {
  file: File;
  neededSec: number;
  busy: boolean;
  previewSrc?: string;
  preparing: boolean;
  onCancel: () => void;
  onConfirm: (inSec: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 재생 소스: 데스크톱은 백엔드 저화질본(previewSrc), 웹은 로컬 blob. blob 은 만든 경우만 revoke.
  const blobUrl = useMemo(
    () => (!preparing && !previewSrc ? URL.createObjectURL(file) : ""),
    [preparing, previewSrc, file],
  );
  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);
  const url = previewSrc || blobUrl;

  const [videoDur, setVideoDur] = useState<number | null>(null);
  const [inSec, setInSec] = useState(0);
  const [err, setErr] = useState(false); // 로컬 재생 불가(예: HEVC) → 숫자 입력 폴백
  const [diag, setDiag] = useState(""); // 진단: 실패 원인(코드/코덱 지원 여부) — 원인파악용
  const dragging = useRef<{ px: number; startIn: number } | null>(null);
  const seekRaf = useRef<number | null>(null);

  const maxIn = videoDur != null ? Math.max(0, videoDur - neededSec) : 0;
  const tooShort = videoDur != null && videoDur + 0.05 < neededSec;

  const seekTo = useCallback((t: number) => {
    if (seekRaf.current) cancelAnimationFrame(seekRaf.current);
    seekRaf.current = requestAnimationFrame(() => {
      const v = videoRef.current;
      if (v && Number.isFinite(t)) {
        try {
          v.currentTime = t;
        } catch {
          /* seek 실패 무시 */
        }
      }
    });
  }, []);

  const clampIn = useCallback(
    (t: number) => Math.max(0, Math.min(t, maxIn)),
    [maxIn],
  );

  // 창 드래그 — 좌우로만. 나레이션 창의 시작(inSec)을 [0, videoDur-needed]로 이동.
  const onWindowPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (videoDur == null || tooShort) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragging.current = { px: e.clientX, startIn: inSec };
    },
    [videoDur, tooShort, inSec],
  );
  const onWindowPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragging.current;
      const track = trackRef.current;
      if (!d || !track || videoDur == null) return;
      const w = track.getBoundingClientRect().width;
      if (w <= 0) return;
      const deltaSec = ((e.clientX - d.px) / w) * videoDur;
      const next = clampIn(d.startIn + deltaSec);
      setInSec(next);
      seekTo(next);
    },
    [videoDur, clampIn, seekTo],
  );
  const onWindowPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  // 재생 시 선택 구간만 루프(정지 상태에선 드래그로 시크).
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime >= inSec + neededSec || v.currentTime < inSec - 0.2) {
      try {
        v.currentTime = inSec;
      } catch {
        /* noop */
      }
    }
  }, [inSec, neededSec]);

  const winLeftPct = videoDur ? (inSec / videoDur) * 100 : 0;
  const winWidthPct = videoDur ? Math.min(100, (neededSec / videoDur) * 100) : 100;

  return (
    <>
      <p className="text-xs text-muted-foreground">
        이 줄 나레이션은 <b>{neededSec.toFixed(1)}초</b>예요. 아래 파란 창을 좌우로 끌어 그 길이만큼 쓸
        장면을 고르면, 앞뒤로 약간 여유를 두고 잘라 올려요(업로드 후에도 시작점을 미세조정할 수 있어요).
      </p>

      <div className="rounded-lg bg-black">
        {preparing || !url ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-white/70">
            <Loader2 className="size-4 animate-spin" /> 미리보기 준비 중…
          </div>
        ) : !err ? (
          <video
            ref={videoRef}
            src={url}
            muted
            playsInline
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              setVideoDur(Number.isFinite(d) ? d : null);
            }}
            onError={(e) => {
              const v = e.currentTarget;
              const code = v.error?.code ?? "?";
              const hevc = v.canPlayType('video/mp4; codecs="hvc1"') || "no";
              const h264 = v.canPlayType('video/mp4; codecs="avc1.42E01E"') || "no";
              setErr(true);
              setDiag(`실패코드 ${code} · HEVC재생 ${hevc || "no"} · H264재생 ${h264 || "no"} · 형식 ${file.type || "(빈값)"}`);
            }}
            onTimeUpdate={onTimeUpdate}
            className="mx-auto max-h-[45vh] w-auto"
          />
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/70">
            <span>
              이 형식은 미리보기가 지원되지 않아요(그래도 올리면 정상 재생돼요). 아래에 시작 시각(초)을 직접
              입력해 주세요.
            </span>
            {diag ? <span className="text-[0.65rem] text-white/40">{diag}</span> : null}
          </div>
        )}
      </div>

      {tooShort ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          영상({videoDur?.toFixed(1)}초)이 나레이션({neededSec.toFixed(1)}초)보다 짧아요. 더 긴 영상을
          올려주세요.
        </p>
      ) : err ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">시작 시각(초)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={inSec}
            onChange={(e) => setInSec(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">부터 {neededSec.toFixed(1)}초</span>
        </div>
      ) : videoDur != null ? (
        <div className="space-y-1.5">
          {/* 트랙바: 전체 길이 위에 고정폭 창을 좌우로 드래그 */}
          <div
            ref={trackRef}
            className="relative h-10 w-full overflow-hidden rounded-md border border-border bg-muted/60"
          >
            <div
              onPointerDown={onWindowPointerDown}
              onPointerMove={onWindowPointerMove}
              onPointerUp={onWindowPointerUp}
              onPointerCancel={onWindowPointerUp}
              className={cn(
                "absolute inset-y-0 touch-none rounded-md border-2 border-sky-500 bg-sky-400/25",
                "cursor-grab active:cursor-grabbing",
              )}
              style={{ left: `${winLeftPct}%`, width: `${winWidthPct}%` }}
              title="드래그해서 쓸 구간을 옮겨요"
            />
          </div>
          <div className="flex justify-between text-[0.7rem] tabular-nums text-muted-foreground">
            <span>{fmt(inSec)}</span>
            <span>
              선택 {fmt(inSec)} ~ {fmt(inSec + neededSec)}
            </span>
            <span>{fmt(videoDur)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">영상 정보를 읽는 중…</p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button
          // 재생 불가(err) 폴백은 영상 길이를 몰라 maxIn=0 이라 clampIn 이 0 으로 눌러버린다.
          // 이 경우엔 입력값을 그대로 보내고 서버(실측 duration)에서 클램프하게 맡긴다.
          onClick={() => onConfirm(err ? Math.max(0, inSec) : clampIn(inSec))}
          disabled={busy || preparing || tooShort || (!err && videoDur == null)}
        >
          {busy ? "올리는 중…" : "이 구간으로 올리기"}
        </Button>
      </DialogFooter>
    </>
  );
}
