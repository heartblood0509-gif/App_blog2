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
// 제목도 onTitlePosChange 가 있으면 같은 방식으로 끌어 옮긴다 — 단 좌표는 절대값이 아니라
// 기본 위치 기준 델타(titleDx/titleDy, 렌더 px). 0/0 이면 기존 고정 위치와 픽셀 동일.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TITLE_FONT,
  DEFAULT_TITLE_FONT_WEIGHT,
  DEFAULT_TITLE_FONT_SIZE,
  DEFAULT_TITLE_DX,
  DEFAULT_TITLE_DY,
  DEFAULT_SUBTITLE_FONT,
  DEFAULT_SUBTITLE_FONT_WEIGHT,
  DEFAULT_SUBTITLE_FONT_SIZE,
  DEFAULT_SUBTITLE_COLOR,
  DEFAULT_SUBTITLE_DX,
  DEFAULT_SUBTITLE_Y,
  titleFontStyle,
  titleRenderFirstTy,
  defaultTitleLineGap,
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

// 제목 위치 클램프(렌더 기준 델타 px) + 스냅(dx→0 중앙, dy→0 기본높이). 백엔드 clamp 범위와 동일.
const TITLE_DX_ABS = 350;
const TITLE_DY_MIN = -110;
const TITLE_DY_MAX = 1480;

// 제목-입력 단계 프리뷰 전용 가이드(옵션). 렌더 무관, 시각 안내만.
// 미디어 밴드: 실제 영상은 미디어가 cover 로 꽉 차지만, 이 단계엔 미디어가 없어 "의도한 틀"만 도식으로.
const CHECKER_TOP_FRAC = 0.24427; // 위 검정 띠(469/1920)
const CHECKER_H_FRAC = 0.50833; // 가운데 밴드(976/1920)
// 썸네일 상단 잘림선 — 군림보 실제 쇼츠 제목 첫 줄 상단(208/1920=10.833%) 실측값.
const THUMB_CROP_FRAC = 0.10833;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function ShortsPreviewFrame({
  titleLine1,
  titleLine2,
  titleFont = DEFAULT_TITLE_FONT,
  titleFontWeight = DEFAULT_TITLE_FONT_WEIGHT,
  titleFontSize = DEFAULT_TITLE_FONT_SIZE,
  titleColor1 = DEFAULT_TITLE_COLOR1,
  titleColor2 = DEFAULT_TITLE_COLOR2,
  titleLine1Size,
  titleLine2Size,
  titleLineGap,
  titleDx = DEFAULT_TITLE_DX,
  titleDy = DEFAULT_TITLE_DY,
  onTitlePosChange,
  onOverflowChange,
  showChecker = false,
  showThumbCrop = false,
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
  titleLine1Size?: number; // 첫 줄 크기(px, 1080폭). 미지정 시 titleFontSize 폴백.
  titleLine2Size?: number; // 둘째 줄 크기(px, 1080폭). 미지정 시 titleFontSize 폴백.
  titleLineGap?: number; // 첫줄↔둘째줄 간격(top-to-top, px, 1080폭). 미지정 시 기존 공식.
  titleDx?: number; // 제목 가로 중앙 오프셋(px, 1080폭). 기본 0(중앙).
  titleDy?: number; // 제목 세로 델타(px, 1920높이) — 기본 위치 기준. 기본 0.
  // 있으면 제목을 끌어 위치를 옮길 수 있다(없으면 고정 표시). 2줄은 한 덩어리로 함께 이동.
  onTitlePosChange?: (dx: number, dy: number) => void;
  onOverflowChange?: (overflow: boolean) => void; // 제목 줄이 프레임 폭을 넘으면 알림(경고 표시용).
  showChecker?: boolean; // 가운데 미디어 밴드를 체커보드로 표시(제목-입력 단계, 미디어 없음).
  showThumbCrop?: boolean; // 썸네일 상단 잘림선(점선) 표시(제목-입력 단계).
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
  const k = width / 1080; // 렌더(1080폭) → 프레임 폭 스케일. height/1920 와 동일.

  // 제목 줄별 크기·간격(렌더 px, 1080폭). 미지정이면 단일 크기(titleFontSize)·기존 간격 공식 폴백.
  const size1 = titleLine1Size ?? titleFontSize;
  const size2 = titleLine2Size ?? titleFontSize;
  const lineGap = titleLineGap ?? defaultTitleLineGap(titleFontSize);
  // 실제로 보이는 줄(입력된 것만). 렌더 first_ty 공식은 줄 수·마지막 줄 크기에 의존.
  const shownSizes: number[] = [];
  if (titleLine1) shownSizes.push(size1);
  if (titleLine2) shownSizes.push(size2);
  // 첫 줄 상단(프레임 px). 각 줄 상단 = firstTyPx + j*lineGap*k. 세로 델타는 translate 로 별도 적용.
  const firstTyPx = shownSizes.length > 0 ? titleRenderFirstTy(shownSizes, lineGap) * k : 0;

  // 제목 공통 스타일(외곽선/그림자/폰트) — 크기는 줄별로 적용하므로 제외.
  const titleBaseCommon = {
    WebkitTextStroke: TITLE_STROKE,
    textShadow: TITLE_SHADOW,
    ...titleFontStyle(titleFont, titleFontWeight),
  } as const;

  // 줄이 프레임 폭을 넘으면(scrollWidth > 프레임 폭) 부모에 알린다(경고 표시용).
  const line1Ref = useRef<HTMLDivElement>(null);
  const line2Ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onOverflowChange) return;
    const raf = requestAnimationFrame(() => {
      const over =
        (line1Ref.current?.scrollWidth ?? 0) > width + 1 ||
        (line2Ref.current?.scrollWidth ?? 0) > width + 1;
      onOverflowChange(over);
    });
    return () => cancelAnimationFrame(raf);
  }, [titleLine1, titleLine2, size1, size2, titleFont, titleFontWeight, width, onOverflowChange]);

  // ── 제목 드래그 ─────────────────────────────────────────────
  // 자막 드래그와 동일 패턴. 두 줄이 하나의 드래그 상태를 공유해 어느 줄을 잡아도 함께 움직인다.
  const titleDraggable = !!onTitlePosChange;
  const [titleFocused, setTitleFocused] = useState(false);
  const [titleSnap, setTitleSnap] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const titleDrag = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null);
  const titleBoxRef = useRef<HTMLDivElement>(null);

  const onTitleDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onTitlePosChange) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      titleDrag.current = { px: e.clientX, py: e.clientY, dx: titleDx, dy: titleDy };
      setTitleFocused(true);
    },
    [onTitlePosChange, titleDx, titleDy],
  );
  const onTitleMove = useCallback(
    (e: React.PointerEvent) => {
      const d = titleDrag.current;
      if (!d || !onTitlePosChange) return;
      d.dx = clamp(d.dx + (e.clientX - d.px) / k, -TITLE_DX_ABS, TITLE_DX_ABS);
      d.dy = clamp(d.dy + (e.clientY - d.py) / k, TITLE_DY_MIN, TITLE_DY_MAX);
      d.px = e.clientX;
      d.py = e.clientY;
      const snapV = Math.abs(d.dx) < SNAP_DX; // 중앙 마그네틱
      const snapH = Math.abs(d.dy) < SNAP_Y; // 기본 높이(dy=0) 약한 스냅
      setTitleSnap((g) => (g.v === snapV && g.h === snapH ? g : { v: snapV, h: snapH }));
      onTitlePosChange(snapV ? 0 : Math.round(d.dx), snapH ? 0 : Math.round(d.dy));
    },
    [onTitlePosChange, k],
  );
  const onTitleUp = useCallback((e: React.PointerEvent) => {
    if (!titleDrag.current) return;
    titleDrag.current = null;
    setTitleSnap({ v: false, h: false });
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  // 제목 바깥 클릭 / Esc 로 포커스(점선 힌트) 해제.
  useEffect(() => {
    if (!titleFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTitleFocused(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!titleBoxRef.current?.contains(e.target as Node)) setTitleFocused(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [titleFocused]);

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

      {/* 제목-입력 단계: 가운데 미디어 밴드를 체커보드로(미디어 없음 표시). 실제 렌더는 cover 로 꽉 참. */}
      {showChecker ? (
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: `${CHECKER_TOP_FRAC * 100}%`,
            height: `${CHECKER_H_FRAC * 100}%`,
            background: "repeating-conic-gradient(#d4d4d8 0% 25%, #f4f4f5 0% 50%)",
            backgroundSize: "20px 20px",
          }}
        />
      ) : null}

      {/* 제목 오버레이 — dx/dy 는 렌더 좌표 델타를 축소 적용(WYSIWYG). 두 줄을 하나의 상자로 묶어
          함께 드래그. 세로 위치는 백엔드 first_ty 공식(줄별 크기·간격)을 그대로 축소해 렌더 정합.
          각 줄은 상자 안에서 top=j*gap*k 로 절대 배치(줄별 크기가 달라도 top-to-top 간격 유지). */}
      {titleLine1 || titleLine2 ? (
        <div
          ref={titleBoxRef}
          onPointerDown={onTitleDown}
          onPointerMove={onTitleMove}
          onPointerUp={onTitleUp}
          onPointerCancel={onTitleUp}
          className={cn(
            "absolute inset-x-0",
            titleDraggable
              ? "pointer-events-auto touch-none cursor-grab active:cursor-grabbing"
              : "pointer-events-none",
            titleDraggable &&
              titleFocused &&
              "outline-dashed outline-1 outline-offset-2 outline-sky-400/90",
          )}
          style={{
            top: firstTyPx,
            height:
              Math.max(0, shownSizes.length - 1) * lineGap * k +
              (shownSizes[shownSizes.length - 1] ?? titleFontSize) * k * 1.25,
            transform: `translate(${titleDx * k}px, ${titleDy * k}px)`,
          }}
          title={titleDraggable ? "드래그해서 제목 위치를 옮겨요" : undefined}
        >
          {titleLine1 ? (
            <div
              ref={line1Ref}
              className="absolute inset-x-0 whitespace-nowrap text-center font-extrabold"
              style={{ ...titleBaseCommon, top: 0, lineHeight: 1, fontSize: `${size1 * k}px`, color: titleColor1 }}
            >
              {titleLine1}
            </div>
          ) : null}
          {titleLine2 ? (
            <div
              ref={line2Ref}
              className="absolute inset-x-0 whitespace-nowrap text-center font-extrabold"
              style={{
                ...titleBaseCommon,
                top: `${(titleLine1 ? lineGap : 0) * k}px`,
                lineHeight: 1,
                fontSize: `${size2 * k}px`,
                color: titleColor2,
              }}
            >
              {titleLine2}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 자막/제목 마그네틱 가이드라인 — 스냅 순간에만(프레임 안, 클리핑 OK) */}
      {((draggable && snap.v) || (titleDraggable && titleSnap.v)) && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-sky-400/80" />
      )}
      {draggable && snap.h && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 h-px bg-sky-400/80"
          style={{ top: DEFAULT_SUBTITLE_Y * k }}
        />
      )}
      {titleDraggable && titleSnap.h && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 h-px bg-sky-400/80"
          style={{ top: firstTyPx }}
        />
      )}

      {/* 썸네일 상단 잘림선 — 제목-입력 단계 전용 가이드(렌더 무관). 이 선 위쪽은 유튜브 썸네일에서 잘림. */}
      {showThumbCrop ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-fuchsia-500"
          style={{ top: `${THUMB_CROP_FRAC * 100}%` }}
        >
          <span className="absolute right-1 top-0 -translate-y-1/2 rounded-sm bg-fuchsia-500 px-1 text-[8px] font-semibold leading-tight text-white">
            썸네일 잘림선
          </span>
        </div>
      ) : null}

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
            {/* 조각 안의 개행("\n")은 화면 줄바꿈 — 줄별 블록으로 쌓아 두 줄 자막을 흉내(최종 영상과 동일). */}
            {subtitle.split("\n").map((ln, i) => (
              <span key={i} className="block">
                {ln}
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
