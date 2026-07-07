"use client";

// 저장된 영상 조각에서 "쓸 구간"을 고르는 미니 트랙 — 고정폭 창(=나레이션 길이)을 좌우로 드래그.
// 업로드 모달의 구간 선택과 같은 조작감. 조각엔 앞뒤 여유분만 있으므로 창이 트랙을 거의 채우고
// 양옆 슬랙만큼만 움직인다. 드래그 중 onChange(실시간), 놓을 때 onCommit(서버 저장).

import { useRef } from "react";
import { cn } from "@/lib/utils";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SegmentTrack({
  duration,
  windowSec,
  value,
  disabled = false,
  onChange,
  onCommit,
}: {
  duration: number; // 트랙 전체 길이(초) = 저장된 조각 길이
  windowSec: number; // 창 폭(초) = 나레이션 길이
  value: number; // 창 시작(초) = clip_start
  disabled?: boolean;
  onChange: (v: number) => void; // 드래그 중 실시간
  onCommit?: (v: number) => void; // 놓을 때 확정(서버 저장)
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; start: number } | null>(null);
  const last = useRef(value);
  const maxStart = Math.max(0, duration - windowSec);
  const clamp = (v: number) => Math.max(0, Math.min(v, maxStart));

  const leftPct = duration ? (value / duration) * 100 : 0;
  const widthPct = duration ? Math.min(100, (windowSec / duration) * 100) : 100;

  const onDown = (e: React.PointerEvent) => {
    if (disabled || maxStart <= 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, start: value };
    last.current = value;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const t = trackRef.current;
    if (!d || !t) return;
    const w = t.getBoundingClientRect().width;
    if (w <= 0) return;
    const next = clamp(d.start + ((e.clientX - d.px) / w) * duration);
    last.current = next;
    onChange(next);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    // 움직이지 않고 클릭만 했으면(값 불변) 불필요한 저장 요청을 생략.
    if (last.current !== d.start) onCommit?.(last.current);
  };

  return (
    <div>
      <div
        ref={trackRef}
        className="relative h-8 w-full overflow-hidden rounded-md border border-border bg-muted/60"
      >
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={cn(
            "absolute inset-y-0 touch-none rounded-md border-2 border-sky-500 bg-sky-400/25",
            disabled || maxStart <= 0
              ? "cursor-default opacity-70"
              : "cursor-grab active:cursor-grabbing",
          )}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          title="드래그해서 쓸 구간을 옮겨요"
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[0.65rem] tabular-nums text-muted-foreground">
        <span>{fmt(value)}</span>
        <span>{fmt(value + windowSec)}</span>
      </div>
    </div>
  );
}
