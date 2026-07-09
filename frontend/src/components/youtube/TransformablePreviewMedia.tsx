"use client";

// 카드 B 프리뷰 편집 레이어 — 업로드한 이미지/영상을 드래그로 위치, 휠/핸들로 배율 조절.
// ShortsPreviewFrame(9:16, overflow-hidden)의 children 으로 들어간다. 배경은 검정(렌더 캔버스와 동일).
//
// 배치는 lib/youtube/transform.ts 의 computePlacement 로 계산 — 백엔드 렌더와 동일 수식이라
// 여기 보이는 그대로 최종 영상에 담긴다(WYSIWYG). 미디어 자체는 pointer-events-none 으로 두고
// 래퍼가 포인터를 소유한다(영상 기본 컨트롤/이미지 드래그고스트가 드래그를 가로채지 않게).
//
// 프레임을 벗어난 미디어의 외곽선·리사이즈 핸들은 프레임(overflow-hidden) 안에서는 그릴 수 없어,
// 부모가 프레임 *형제*로 둔 overlayEl(overflow 미적용) 에 포털로 그린다. 클릭=포커스 시에만 표시.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clampTransform,
  computePlacement,
  DEFAULT_MOTION_SPEED,
  MOTION_ZOOM_MAX,
  OFFSET_MAX,
  SCALE_MIN,
  SCALE_MAX,
  type LineTransform,
} from "@/lib/youtube/transform";
import { CHECKER_BG_STYLE } from "@/lib/youtube/layout";

const WHEEL_STEP = 1.05;
const COMMIT_DEBOUNCE_MS = 400;
// 중앙 마그네틱 반경(프레임 px). 원시 드래그 위치가 이 안이면 중앙에 붙고, 벗어나면 즉시 풀린다.
// 반경이 곧 자석 세기 — 일부러 작게 잡아 "슬쩍 붙는" 정도로 유지(강하면 미세 조정을 방해).
const SNAP_PX = 6;

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

export function TransformablePreviewMedia({
  src,
  kind,
  frameWidth,
  transform,
  disabled = false,
  emptyBg = "black",
  blurSigma = null,
  overlayEl,
  spotlight = false,
  clipStart,
  clipWindow,
  motion,
  motionRate,
  motionDurationSec,
  onChange,
  onCommit,
}: {
  src: string;
  kind: "image" | "clip";
  frameWidth: number;
  transform: LineTransform;
  disabled?: boolean;
  // 미디어가 안 덮는 빈 공간의 배경. "black"=검정(기본, 최종 렌더와 동일). "checker"=체커보드
  // (full 레이아웃 편집 시 "여기 비어있음" 표시 — 최종 영상은 검정). boxed 는 박스가 덮으므로 black.
  emptyBg?: "black" | "checker";
  // 흐림 배경(blur 레이아웃) sigma(1080폭 기준). null 이면 배경층 없음. 값이 있으면 같은 미디어를
  // 화면 가득 늘려 CSS blur 한 층을 fg 뒤에 깔아 최종 렌더(gblur)를 흉내낸다.
  blurSigma?: number | null;
  // 프레임 밖 외곽선/핸들을 그릴 컨테이너(프레임의 형제, overflow 미적용). 없으면 핸들 기능 생략.
  overlayEl?: HTMLElement | null;
  // 외부에서 잠깐 외곽선+핸들을 켜는 신호(크기 슬라이더 조작 중). 포커스 없이도 "잡을 수 있음"을 노출.
  spotlight?: boolean;
  // 영상 조각(clip)에서 실제 쓰이는 구간 [clipStart, clipStart+clipWindow]만 반복 재생(WYSIWYG).
  clipStart?: number | null;
  clipWindow?: number | null;
  // 줌(모션) 미리보기 — "zoom_in"/"zoom_out"이면 프레임 중심 기준 확대/축소를 반복 재생.
  motion?: string | null;
  motionRate?: number; // 초당 확대 비율(작업 전역)
  motionDurationSec?: number | null; // 이 줄 나레이션 길이(초) — 반복 주기·최대 배율 계산용
  onChange: (t: LineTransform) => void; // 드래그/휠 중 실시간 갱신(미저장)
  onCommit: (t: LineTransform) => void; // 확정(서버 저장) — 드래그 끝/휠 정지 시
}) {
  const frameHeight = Math.round((frameWidth * 16) / 9);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  // 원본 크기(naturalWidth/videoWidth). 미확정이면 미디어를 숨겨 잘못된 위치 번쩍임 방지.
  // src(줄/자산)가 바뀌면 부모가 key 로 이 컴포넌트를 remount 하므로 자연히 null 로 초기화된다.
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  // 클릭(포커스) 시 외곽선+핸들 표시. 바깥 클릭/Esc 로 해제.
  const [focused, setFocused] = useState(false);
  // 드래그 중 중앙 스냅 상태 — 가이드라인 표시용. v=세로 중앙선(x 스냅), h=가로 중앙선(y 스냅).
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  // 최신 transform 을 이벤트 핸들러에서 참조(리스너 재바인딩 없이).
  const tRef = useRef(transform);
  useEffect(() => {
    tRef.current = transform;
  }, [transform]);

  // ── 프리뷰 실시간 모션 ──
  // 최종 렌더(ffmpeg zoompan)를 CSS scale 애니메이션으로 근사해 항상 반복 재생한다.
  // 미디어를 감싼 "줌 레이어"(프레임과 동일 크기·중심)를 scale 하면, 렌더의 "합성 프레임 전체를
  // 프레임 중심 기준 확대 후 중앙 크롭"과 같은 그림이 된다(검정 배경은 스케일돼도 무해).
  const motionLayerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  // 속도 슬라이더를 끌면 rate 가 바뀌며 애니메이션이 재생성되는데, 직전 진행 위상(ms)을 이어받아
  // scale(1) 로 튕기지 않고 매끄럽게 이어지게 한다(같은 줄이면 주기 d 가 동일 → 위상 그대로 유효).
  const phaseRef = useRef<number | null>(null);
  // 편집(드래그·리사이즈·크기 슬라이더) 중엔 정지 — 좌표 수식·외곽선과 시각이 어긋나지 않게.
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = focused || spotlight;
    const anim = animRef.current;
    if (!anim) return;
    if (pausedRef.current) anim.pause();
    else anim.play();
  }, [focused, spotlight]);

  useEffect(() => {
    const layer = motionLayerRef.current;
    if (!layer) return;
    const zoom = motion === "zoom_in" || motion === "zoom_out";
    const rate = motionRate ?? DEFAULT_MOTION_SPEED;
    const d = motionDurationSec && motionDurationSec > 0 ? motionDurationSec : 4;
    const end = Math.min(1 + rate * d, MOTION_ZOOM_MAX);
    // 줌이 아니거나(none·레거시 팬) 편집 불가·미로드·확대량 0 이면 애니메이션 없음.
    if (disabled || !nat || !zoom || end <= 1.0001) {
      layer.style.transform = "";
      return;
    }
    // 상한(1.5x)에 걸리면 그 지점(capT) 이후로는 등속 정지 — 렌더의 z 클램프와 동일.
    const capT = Math.min(1, (end - 1) / (rate * d));
    const zoomIn = motion === "zoom_in";
    const a = zoomIn ? 1 : end; // 시작 배율
    const b = zoomIn ? end : 1; // 목표 배율
    const durMs = d * 1000;
    const anim = layer.animate(
      [
        { transform: `scale(${a})`, offset: 0 },
        { transform: `scale(${b})`, offset: capT },
        { transform: `scale(${b})`, offset: 1 },
      ],
      { duration: durMs, iterations: Infinity, easing: "linear" },
    );
    if (phaseRef.current != null) {
      try {
        anim.currentTime = phaseRef.current % durMs; // 직전 위상 이어받기(rate 변경 시 매끄럽게)
      } catch {
        /* noop */
      }
    }
    animRef.current = anim;
    if (pausedRef.current) anim.pause();
    return () => {
      const t = anim.currentTime;
      phaseRef.current = typeof t === "number" ? t : null;
      anim.cancel();
      if (animRef.current === anim) animRef.current = null;
    };
  }, [motion, motionRate, motionDurationSec, nat, disabled]);

  // 이동 드래그: 스냅과 무관한 원시 누적 위치를 따로 들고 간다(스냅에 붙어도 포인터가
  // 반경만 벗어나면 바로 풀리게 — 자석이 드래그를 "붙잡는" 느낌 방지).
  const dragging = useRef<{ px: number; py: number; rawX: number; rawY: number } | null>(null);
  // 리사이즈 드래그(핸들). 시작 시점의 배치·스케일·앵커를 고정해 두고 포인터로 배율만 재계산.
  const resizing = useRef<{
    id: HandleId;
    rect: DOMRect; // 프레임 bounding rect(드래그 동안 불변) — 포인터→프레임 좌표 변환용
    scale0: number;
    cx0: number; // 시작 중심(프레임 px)
    cy0: number;
    L: number; // 시작 배치(프레임 px)
    T: number;
    W0: number;
    H0: number;
  } | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 마지막으로 onChange 로 내보낸 값 — 드래그 종료 시 이것을 커밋(부모 왕복 지연과 무관).
  const lastSent = useRef<LineTransform | null>(null);

  const emit = useCallback(
    (t: LineTransform) => {
      lastSent.current = t;
      onChange(t);
    },
    [onChange],
  );

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

  // ── 이동 드래그 (프레임 영역) ─────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !nat) return;
      setFocused(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const t = tRef.current;
      dragging.current = { px: e.clientX, py: e.clientY, rawX: t.x, rawY: t.y };
    },
    [disabled, nat],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragging.current;
      if (!d) return;
      // 원시 누적을 배치 한계(±OFFSET_MAX)로 클램프 — 화면 밖으로 계속 끌어도 무한 누적되지 않아
      // 되돌릴 때 "헛드래그"가 생기지 않는다(clampTransform 과 동일 범위).
      d.rawX = Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, d.rawX + (e.clientX - d.px) / frameWidth));
      d.rawY = Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, d.rawY + (e.clientY - d.py) / frameHeight));
      d.px = e.clientX;
      d.py = e.clientY;
      // 중앙 마그네틱 — 원시 위치가 반경 안일 때만 0 으로 스냅.
      const snapV = Math.abs(d.rawX) < SNAP_PX / frameWidth;
      const snapH = Math.abs(d.rawY) < SNAP_PX / frameHeight;
      setGuides((g) => (g.v === snapV && g.h === snapH ? g : { v: snapV, h: snapH }));
      emit(
        clampTransform({
          scale: tRef.current.scale,
          x: snapV ? 0 : d.rawX,
          y: snapH ? 0 : d.rawY,
        }),
      );
    },
    [emit, frameWidth, frameHeight],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = null;
      setGuides({ v: false, h: false });
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      onCommit(lastSent.current ?? tRef.current);
    },
    [onCommit],
  );

  // ── 휠 줌 — React onWheel 은 passive 라 preventDefault 불가. 비-passive 로 직접 바인딩.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || disabled) return;
    const handler = (e: WheelEvent) => {
      if (!nat) return;
      e.preventDefault();
      const t = tRef.current;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      const next = clampTransform({ scale: t.scale * factor, x: t.x, y: t.y });
      lastSent.current = next;
      onChange(next);
      scheduleCommit(next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [disabled, nat, onChange, scheduleCommit]);

  // clipStart 가 바뀌면(시작점 슬라이더) 영상을 그 지점으로 즉시 시크 — 슬라이더 시각 피드백.
  useEffect(() => {
    const v = videoElRef.current;
    if (v && clipStart != null) {
      try {
        v.currentTime = clipStart;
      } catch {
        /* seek 실패 무시 */
      }
    }
  }, [clipStart]);

  // ── 포커스 해제 — 프레임/오버레이 밖 클릭 또는 Esc ──────────────
  useEffect(() => {
    if (!focused) return;
    const onDocDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (overlayEl?.contains(target)) return;
      setFocused(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocused(false);
    };
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [focused, overlayEl]);

  // ── 핸들 리사이즈 — 중심 고정 · 비율 유지(uniform scale) ──────────
  // 어느 면·꼭지점을 잡든 중심(cx0,cy0)은 그대로 두고, 잡은 핸들이 중심에서 멀어진 만큼
  // 모든 변·모서리가 함께 비율을 유지한 채 커지거나 줄어든다(위치 x/y 는 불변).
  const onHandleDown = useCallback(
    (e: React.PointerEvent, id: HandleId) => {
      if (disabled || !nat || !wrapRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      // 핸들을 잡으면 포커스를 확정한다 — spotlight(크기 슬라이더 조작)로만 떠 있던 핸들을
      // 드래그하는 도중 spotlight 가 만료돼도 포털이 안 사라져 드래그·커밋이 끊기지 않는다.
      setFocused(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const t = tRef.current;
      const p = computePlacement(nat.w, nat.h, t, frameWidth, frameHeight);
      resizing.current = {
        id,
        rect: wrapRef.current.getBoundingClientRect(),
        scale0: t.scale,
        cx0: p.left + p.width / 2,
        cy0: p.top + p.height / 2,
        L: p.left,
        T: p.top,
        W0: p.width,
        H0: p.height,
      };
    },
    [disabled, nat, frameWidth, frameHeight],
  );

  const onHandleMove = useCallback(
    (e: React.PointerEvent) => {
      const r = resizing.current;
      if (!r) return;
      const px = e.clientX - r.rect.left;
      const py = e.clientY - r.rect.top;
      const { id, W0, H0, cx0, cy0, scale0 } = r;
      // 중심에서 포인터까지의 벡터. 잡은 핸들 종류에 따라 이 거리로 배율만 재계산한다.
      const dx = px - cx0;
      const dy = py - cy0;

      let k: number; // 새 배율 / 시작 배율
      if (id === "e" || id === "w") {
        k = Math.abs(dx) / (W0 / 2); // 좌우 변: 가로 반너비 대비
      } else if (id === "n" || id === "s") {
        k = Math.abs(dy) / (H0 / 2); // 상하 변: 세로 반높이 대비
      } else {
        // 꼭지점 — 중심→그 꼭지점 벡터에 (포인터-중심)을 투영해 균일 배율 산출.
        const ux = (id === "ne" || id === "se" ? 1 : -1) * (W0 / 2);
        const uy = (id === "se" || id === "sw" ? 1 : -1) * (H0 / 2);
        k = (dx * ux + dy * uy) / (ux * ux + uy * uy);
      }
      k = clampK(k, scale0);

      // 중심 고정이라 위치(x/y)는 그대로 두고 배율만 바꾼다.
      emit(
        clampTransform({
          scale: scale0 * k,
          x: (cx0 - frameWidth / 2) / frameWidth,
          y: (cy0 - frameHeight / 2) / frameHeight,
        }),
      );
    },
    [emit, frameWidth, frameHeight],
  );

  const endHandleDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!resizing.current) return;
      resizing.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      onCommit(lastSent.current ?? tRef.current);
    },
    [onCommit],
  );

  const place = nat
    ? computePlacement(nat.w, nat.h, transform, frameWidth, frameHeight)
    : null;
  // 줌 애니메이션의 중심(=미디어 자체 중앙). 위치를 옮기면 그 미디어 중앙을 축으로 확대되게
  // transform-origin 을 미디어 중앙 px 로 둔다(렌더 zoom_anchor 와 동일). 프레임 밖은 클램프.
  // 기본(옮기지 않음)이면 미디어 중앙 = 프레임 중앙이라 정중앙 줌.
  const motionOrigin = place
    ? `${Math.min(frameWidth, Math.max(0, place.left + place.width / 2))}px ` +
      `${Math.min(frameHeight, Math.max(0, place.top + place.height / 2))}px`
    : "center";
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

  // 흐림 배경층: 같은 미디어를 cover 1.06배(가장자리 halo 은폐)로 깔고 CSS blur. fg 뒤에 그린다.
  // sigma 는 1080폭 기준이라 프리뷰 폭 비율(frameWidth/1080)로 스케일해 렌더와 시각 정합.
  const bgPlace =
    nat && blurSigma
      ? computePlacement(nat.w, nat.h, { scale: 1.06, x: 0, y: 0 }, frameWidth, frameHeight)
      : null;
  const blurBgStyle: React.CSSProperties | null = bgPlace
    ? {
        position: "absolute",
        left: `${bgPlace.left}px`,
        top: `${bgPlace.top}px`,
        width: `${bgPlace.width}px`,
        height: `${bgPlace.height}px`,
        maxWidth: "none",
        pointerEvents: "none",
        userSelect: "none",
        filter: `blur(${(blurSigma as number) * (frameWidth / 1080)}px)`,
      }
    : null;

  // 8개 핸들의 외곽선 기준 위치(%). 꼭지점 4 + 변 중앙 4.
  const handlePos: Record<HandleId, { left: string; top: string }> = {
    nw: { left: "0%", top: "0%" },
    n: { left: "50%", top: "0%" },
    ne: { left: "100%", top: "0%" },
    e: { left: "100%", top: "50%" },
    se: { left: "100%", top: "100%" },
    s: { left: "50%", top: "100%" },
    sw: { left: "0%", top: "100%" },
    w: { left: "0%", top: "50%" },
  };

  return (
    <>
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={
          "absolute inset-0 touch-none overflow-hidden" +
          (emptyBg === "checker" ? "" : " bg-black") +
          (disabled ? " cursor-default" : " cursor-grab active:cursor-grabbing")
        }
        style={emptyBg === "checker" ? CHECKER_BG_STYLE : undefined}
      >
        {/* 줌 레이어 — 프레임과 동일 크기. scale 애니메이션의 중심(transform-origin)은 미디어 자체
            중앙(motionOrigin). 배치 좌표계는 보존, 줌만 미디어 중앙을 축으로 돈다. */}
        <div
          ref={motionLayerRef}
          className="pointer-events-none absolute inset-0 will-change-transform"
          style={{ transformOrigin: motionOrigin }}
        >
          {/* 흐림 배경층 — fg 뒤(먼저 그림). 같은 미디어를 화면 가득 늘려 CSS blur. */}
          {blurBgStyle ? (
            kind === "clip" ? (
              <video
                key={`bg-${src}`}
                src={src}
                autoPlay
                muted
                loop
                playsInline
                draggable={false}
                aria-hidden
                style={blurBgStyle}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지
              <img src={src} alt="" aria-hidden draggable={false} style={blurBgStyle} />
            )
          ) : null}
          {kind === "clip" ? (
            <video
            ref={videoElRef}
            key={src}
            src={src}
            autoPlay
            muted
            loop
            playsInline
            draggable={false}
            onLoadedMetadata={(e) => {
              setNat({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
              if (clipStart != null) {
                try {
                  e.currentTarget.currentTime = clipStart;
                } catch {
                  /* noop */
                }
              }
            }}
            onTimeUpdate={(e) => {
              // 실제 쓰이는 구간만 반복 재생(선트림 조각의 여유분 밖은 안 보여줌).
              if (clipStart == null || !clipWindow) return;
              const v = e.currentTarget;
              if (v.currentTime >= clipStart + clipWindow || v.currentTime < clipStart - 0.2) {
                try {
                  v.currentTime = clipStart;
                } catch {
                  /* noop */
                }
              }
            }}
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

        {/* 중앙 마그네틱 가이드라인 — 스냅 순간에만 표시(프레임 안, 클리핑 OK) */}
        {guides.v && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-sky-400/80" />
        )}
        {guides.h && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-sky-400/80" />
        )}
      </div>

      {/* 포커스(클릭) 또는 spotlight(크기 슬라이더 조작 중) 시 외곽선+핸들 —
          프레임 밖까지 보여야 하므로 형제 오버레이에 포털로 렌더 */}
      {(focused || spotlight) && !disabled && place && overlayEl
        ? createPortal(
            <div
              className="pointer-events-none absolute border border-sky-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{
                left: `${place.left}px`,
                top: `${place.top}px`,
                width: `${place.width}px`,
                height: `${place.height}px`,
              }}
            >
              {(Object.keys(handlePos) as HandleId[]).map((id) => (
                <div
                  key={id}
                  onPointerDown={(e) => onHandleDown(e, id)}
                  onPointerMove={onHandleMove}
                  onPointerUp={endHandleDrag}
                  onPointerCancel={endHandleDrag}
                  className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-[2px] border border-sky-500 bg-white shadow"
                  style={{ ...handlePos[id], cursor: HANDLE_CURSOR[id] }}
                />
              ))}
            </div>,
            overlayEl,
          )
        : null}
    </>
  );
}

// 배율 배수 k 를 [최소 크기, SCALE_MIN..SCALE_MAX] 안으로 제한.
function clampK(k: number, scale0: number): number {
  if (!Number.isFinite(k)) return 1;
  return Math.min(Math.max(k, SCALE_MIN / scale0, 0.02), SCALE_MAX / scale0);
}
