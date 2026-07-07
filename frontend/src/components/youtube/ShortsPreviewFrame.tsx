"use client";

// 쇼츠(9:16) 미리보기 프레임 — 미디어 배경 위에 영상 제목·자막 오버레이를 얹는다.
// 원본 youtube_auto 의 "선택 줄 프리뷰"에서 쓰던 오버레이 스타일의 단일 출처. 제목/자막이 영상에
// 실제로 박히는 건 최종 제작(FFmpeg)이 하고, 여기서는 최종 모습을 시각적으로 흉내만 낸다.
//
// 제목 메트릭(위치 24/50px, 폰트 22px)은 200px 폭 기준으로 잡혀 있다. width 를 키우면
// 같은 비율(s = width/200)로 제목 위치·크기도 함께 스케일해 폭이 달라져도 정합을 유지한다.
//
// 자막은 렌더(1080×1920) 좌표계를 그대로 축소해 그린다(WYSIWYG): y=자막 상단, dx=가로 중앙
// 오프셋. onSubtitlePosChange 가 있으면 자막을 끌어 위치를 옮길 수 있다(중앙/기본높이 마그네틱).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TITLE_FONT,
  DEFAULT_TITLE_FONT_WEIGHT,
  DEFAULT_TITLE_FONT_SIZE,
  DEFAULT_SUBTITLE_FONT,
  DEFAULT_SUBTITLE_FONT_WEIGHT,
  DEFAULT_SUBTITLE_FONT_SIZE,
  DEFAULT_SUBTITLE_COLOR,
  DEFAULT_SUBTITLE_DX,
  DEFAULT_SUBTITLE_Y,
  titleFontStyle,
} from "@/lib/youtube/fonts";
import {
  DEFAULT_TITLE_COLOR1,
  DEFAULT_TITLE_COLOR2,
} from "@/lib/youtube/title-colors";

// 제목 오버레이 외곽선/그림자 — 자막 가독성용. TitleSelect 와 공유.
export const TITLE_STROKE = "0.7px rgba(0,0,0,0.8)";
export const TITLE_SHADOW =
  "1px 1px 0 rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.3)";
export const TITLE_LINE2_COLOR = "#E8D44D"; // 2번째 줄(노란색)

// 제목 메트릭 기준 폭(이 폭에서 아래 px 값이 원본과 정합).
const BASE_WIDTH = 200;

// 자막 위치 클램프(렌더 1080×1920 좌표) + 마그네틱 반경. 백엔드 clamp 범위와 동일.
const SUB_DX_ABS = 350;
const SUB_Y_MIN = 60;
const SUB_Y_MAX = 1750;
const SNAP_DX = 18; // 중앙(dx=0) 마그네틱 반경(1080폭 기준)
const SNAP_Y = 24; // 기본 높이(y=1300) 약한 스냅 반경

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function ShortsPreviewFrame({
  titleLine1,
  titleLine2,
  titleFont = DEFAULT_TITLE_FONT,
  titleFontWeight = DEFAULT_TITLE_FONT_WEIGHT,
  titleFontSize = DEFAULT_TITLE_FONT_SIZE,
  titleColor1 = DEFAULT_TITLE_COLOR1,
  titleColor2 = DEFAULT_TITLE_COLOR2,
  subtitle,
  subtitleFont = DEFAULT_SUBTITLE_FONT,
  subtitleFontWeight = DEFAULT_SUBTITLE_FONT_WEIGHT,
  subtitleFontSize = DEFAULT_SUBTITLE_FONT_SIZE,
  subtitleColor = DEFAULT_SUBTITLE_COLOR,
  subtitleDx = DEFAULT_SUBTITLE_DX,
  subtitleY = DEFAULT_SUBTITLE_Y,
  onSubtitlePosChange,
  onSubtitleDragChange,
  children,
  className,
  width = BASE_WIDTH,
}: {
  titleLine1?: string;
  titleLine2?: string;
  titleFont?: string; // core.fonts id.
  titleFontWeight?: string; // 굵기 id.
  titleFontSize?: number; // 렌더 기준 px(1080폭). 미지정이면 기본 120.
  titleColor1?: string; // 윗줄 색(#RRGGBB).
  titleColor2?: string; // 아랫줄 색(#RRGGBB).
  subtitle?: string; // 하단 자막 오버레이(현재 조각). 최종 영상 자막 위치·스타일 흉내.
  subtitleFont?: string; // core.fonts id 또는 ""(기본 자막폰트).
  subtitleFontWeight?: string;
  subtitleFontSize?: number; // 렌더 기준 px(1080폭). 기본 55.
  subtitleColor?: string; // #RRGGBB. 기본 흰색.
  subtitleDx?: number; // 가로 중앙 오프셋(px, 1080폭). 기본 0.
  subtitleY?: number; // 자막 상단 y(px, 1920높이). 기본 1300.
  // 있으면 자막을 끌어 위치를 옮길 수 있다(없으면 고정 표시).
  onSubtitlePosChange?: (dx: number, y: number) => void;
  onSubtitleDragChange?: (dragging: boolean) => void;
  children?: ReactNode; // 미디어 배경(<img>/<video>/placeholder) — 프레임을 꽉 채우게.
  className?: string;
  width?: number; // 프레임 가로 폭(px). 높이·제목 크기는 9:16 / 비율로 자동.
}) {
  const height = Math.round((width * 16) / 9);
  const s = width / BASE_WIDTH; // 제목 위치 스케일 비율
  const k = width / 1080; // 렌더(1080폭) → 프레임 폭 스케일. height/1920 와 동일.

  // 제목 폰트 크기는 렌더 기준(1080폭) px 을 프레임 폭으로 환산. size 120·width 200 이면 22px(기존값).
  const titleBase = {
    WebkitTextStroke: TITLE_STROKE,
    textShadow: TITLE_SHADOW,
    ...titleFontStyle(titleFont, titleFontWeight),
    fontSize: `${titleFontSize * (width / 1080)}px`,
  } as const;

  // ── 자막 드래그 ─────────────────────────────────────────────
  const draggable = !!onSubtitlePosChange;
  const [subFocused, setSubFocused] = useState(false);
  const [snap, setSnap] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  // 스냅과 무관한 원시 누적 위치(스냅에 붙어도 반경만 벗어나면 바로 풀리게).
  const subDrag = useRef<{ px: number; py: number; dx: number; y: number } | null>(null);
  const subSpanRef = useRef<HTMLSpanElement>(null);

  const onSubDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onSubtitlePosChange) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      subDrag.current = { px: e.clientX, py: e.clientY, dx: subtitleDx, y: subtitleY };
      setSubFocused(true);
      onSubtitleDragChange?.(true);
    },
    [onSubtitlePosChange, onSubtitleDragChange, subtitleDx, subtitleY],
  );
  const onSubMove = useCallback(
    (e: React.PointerEvent) => {
      const d = subDrag.current;
      if (!d || !onSubtitlePosChange) return;
      d.dx = clamp(d.dx + (e.clientX - d.px) / k, -SUB_DX_ABS, SUB_DX_ABS);
      d.y = clamp(d.y + (e.clientY - d.py) / k, SUB_Y_MIN, SUB_Y_MAX);
      d.px = e.clientX;
      d.py = e.clientY;
      const snapV = Math.abs(d.dx) < SNAP_DX; // 중앙 마그네틱
      const snapH = Math.abs(d.y - DEFAULT_SUBTITLE_Y) < SNAP_Y; // 기본 높이 스냅
      setSnap((g) => (g.v === snapV && g.h === snapH ? g : { v: snapV, h: snapH }));
      onSubtitlePosChange(snapV ? 0 : Math.round(d.dx), snapH ? DEFAULT_SUBTITLE_Y : Math.round(d.y));
    },
    [onSubtitlePosChange, k],
  );
  const onSubUp = useCallback(
    (e: React.PointerEvent) => {
      if (!subDrag.current) return;
      subDrag.current = null;
      setSnap({ v: false, h: false });
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      onSubtitleDragChange?.(false);
    },
    [onSubtitleDragChange],
  );

  // 자막 바깥 클릭 / Esc 로 포커스(점선 힌트) 해제.
  useEffect(() => {
    if (!subFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSubFocused(false);
    };
    const onDown = (e: PointerEvent) => {
      // 자막 자체를 누른 게(=드래그 시작) 아니면 포커스 해제.
      if (!subSpanRef.current?.contains(e.target as Node)) setSubFocused(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [subFocused]);

  // 자막 폰트: 번들 4종 중 하나(빈 값/미지의 id 는 titleFontStyle→getTitleFont 가 프리텐다드로 폴백).
  const subFontStyle = titleFontStyle(subtitleFont, subtitleFontWeight);
  const subStroke = Math.max(0.5, (3 * subtitleFontSize) / 55 * k);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-[#0a0a14]",
        className,
      )}
      style={{ width, height }}
    >
      {/* 미디어 배경 레이어 */}
      <div className="absolute inset-0">{children}</div>

      {/* 제목 오버레이 (이미지 위) */}
      {titleLine1 ? (
        <div
          className="pointer-events-none absolute w-full whitespace-nowrap text-center font-extrabold"
          style={{ ...titleBase, color: titleColor1, top: 24 * s }}
        >
          {titleLine1}
        </div>
      ) : null}
      {titleLine2 ? (
        <div
          className="pointer-events-none absolute w-full whitespace-nowrap text-center font-extrabold"
          style={{ ...titleBase, color: titleColor2, top: 50 * s }}
        >
          {titleLine2}
        </div>
      ) : null}

      {/* 자막 마그네틱 가이드라인 — 스냅 순간에만(프레임 안, 클리핑 OK) */}
      {draggable && snap.v && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-sky-400/80" />
      )}
      {draggable && snap.h && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 h-px bg-sky-400/80"
          style={{ top: DEFAULT_SUBTITLE_Y * k }}
        />
      )}

      {/* 자막 오버레이 — 렌더 좌표(y=상단, dx=중앙 오프셋)를 그대로 축소해 흉내(WYSIWYG). */}
      {subtitle ? (
        <div
          className="absolute left-0 w-full text-center"
          style={{ top: subtitleY * k }}
        >
          <span
            ref={subSpanRef}
            onPointerDown={onSubDown}
            onPointerMove={onSubMove}
            onPointerUp={onSubUp}
            onPointerCancel={onSubUp}
            className={cn(
              "inline-block max-w-full whitespace-nowrap px-1 leading-tight",
              draggable
                ? "pointer-events-auto touch-none cursor-grab active:cursor-grabbing"
                : "pointer-events-none",
              draggable && subFocused && "outline-dashed outline-1 outline-offset-2 outline-sky-400/90",
            )}
            style={{
              transform: `translateX(${subtitleDx * k}px)`,
              fontFamily: subFontStyle.fontFamily,
              fontWeight: subFontStyle.fontWeight,
              fontSize: `${subtitleFontSize * k}px`,
              color: subtitleColor,
              WebkitTextStroke: `${subStroke}px #000`,
              textShadow: "0 1px 2px #000, 0 0 3px #000",
            }}
            title={draggable ? "드래그해서 자막 위치를 옮겨요" : undefined}
          >
            {subtitle}
          </span>
        </div>
      ) : null}
    </div>
  );
}
