"use client";

// 카드 B 프리뷰 편집 레이어 — 업로드한 이미지/영상을 드래그로 위치, 휠로 배율 조절.
// ShortsPreviewFrame(9:16, overflow-hidden)의 children 으로 들어간다. 배경은 검정(렌더 캔버스와 동일).
//
// 배치는 lib/youtube/transform.ts 의 computePlacement 로 계산 — 백엔드 렌더와 동일 수식이라
// 여기 보이는 그대로 최종 영상에 담긴다(WYSIWYG). 미디어 자체는 pointer-events-none 으로 두고
// 래퍼가 포인터를 소유한다(영상 기본 컨트롤/이미지 드래그고스트가 드래그를 가로채지 않게).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampTransform,
  computePlacement,
  type LineTransform,
} from "@/lib/youtube/transform";

const WHEEL_STEP = 1.05;
const COMMIT_DEBOUNCE_MS = 400;

export function TransformablePreviewMedia({
  src,
  kind,
  frameWidth,
  transform,
  disabled = false,
  onChange,
  onCommit,
}: {
  src: string;
  kind: "image" | "clip";
  frameWidth: number;
  transform: LineTransform;
  disabled?: boolean;
  onChange: (t: LineTransform) => void; // 드래그/휠 중 실시간 갱신(미저장)
  onCommit: (t: LineTransform) => void; // 확정(서버 저장) — 드래그 끝/휠 정지 시
}) {
  const frameHeight = Math.round((frameWidth * 16) / 9);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 원본 크기(naturalWidth/videoWidth). 미확정이면 미디어를 숨겨 잘못된 위치 번쩍임 방지.
  // src(줄/자산)가 바뀌면 부모가 key 로 이 컴포넌트를 remount 하므로 자연히 null 로 초기화된다.
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  // 최신 transform 을 이벤트 핸들러에서 참조(리스너 재바인딩 없이).
  const tRef = useRef(transform);
  useEffect(() => {
    tRef.current = transform;
  }, [transform]);

  const dragging = useRef<{ x: number; y: number } | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCommit = useCallback(
    (t: LineTransform) => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => onCommit(t), COMMIT_DEBOUNCE_MS);
    },
    [onCommit],
  );
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !nat) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragging.current = { x: e.clientX, y: e.clientY };
    },
    [disabled, nat],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragging.current.x;
      const dy = e.clientY - dragging.current.y;
      dragging.current = { x: e.clientX, y: e.clientY };
      const t = tRef.current;
      onChange(
        clampTransform({
          scale: t.scale,
          x: t.x + dx / frameWidth,
          y: t.y + dy / frameHeight,
        }),
      );
    },
    [onChange, frameWidth, frameHeight],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      onCommit(tRef.current);
    },
    [onCommit],
  );

  // 휠 줌 — React onWheel 은 passive 라 preventDefault 불가. 비-passive 로 직접 바인딩.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || disabled) return;
    const handler = (e: WheelEvent) => {
      if (!nat) return;
      e.preventDefault();
      const t = tRef.current;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      const next = clampTransform({ scale: t.scale * factor, x: t.x, y: t.y });
      onChange(next);
      scheduleCommit(next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [disabled, nat, onChange, scheduleCommit]);

  const place = nat
    ? computePlacement(nat.w, nat.h, transform, frameWidth, frameHeight)
    : null;
  const mediaStyle: React.CSSProperties = place
    ? {
        position: "absolute",
        left: `${place.left}px`,
        top: `${place.top}px`,
        width: `${place.width}px`,
        height: `${place.height}px`,
        maxWidth: "none",
        pointerEvents: "none",
        userSelect: "none",
        opacity: 1,
      }
    : { opacity: 0, pointerEvents: "none" };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={
        "absolute inset-0 touch-none overflow-hidden bg-black" +
        (disabled ? " cursor-default" : " cursor-grab active:cursor-grabbing")
      }
    >
      {kind === "clip" ? (
        <video
          key={src}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          draggable={false}
          onLoadedMetadata={(e) =>
            setNat({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
          }
          style={mediaStyle}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합)
        <img
          src={src}
          alt="자산 미리보기"
          draggable={false}
          onLoad={(e) =>
            setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          style={mediaStyle}
        />
      )}
    </div>
  );
}
