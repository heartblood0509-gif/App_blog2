"use client";

// 쇼츠(9:16) 미리보기 프레임 — 미디어 배경 위에 영상 제목 오버레이(흰 1줄 / 노랑 2줄)를 얹는다.
// 원본 youtube_auto 의 "선택 줄 프리뷰"에서 쓰던 오버레이 스타일의 단일 출처. 제목이 영상에
// 실제로 박히는 건 최종 제작(FFmpeg)이 하고, 여기서는 최종 모습을 시각적으로 흉내만 낸다.
//
// 제목 메트릭(위치 24/50px, 폰트 22px)은 200px 폭 기준으로 잡혀 있다. width 를 키우면
// 같은 비율(s = width/200)로 제목 위치·크기도 함께 스케일해 폭이 달라져도 정합을 유지한다.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TITLE_FONT,
  DEFAULT_TITLE_FONT_WEIGHT,
  DEFAULT_TITLE_FONT_SIZE,
  titleFontStyle,
} from "@/lib/youtube/fonts";

// 제목 오버레이 외곽선/그림자 — 자막 가독성용. TitleSelect 와 공유.
export const TITLE_STROKE = "0.7px rgba(0,0,0,0.8)";
export const TITLE_SHADOW =
  "1px 1px 0 rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.3)";
export const TITLE_LINE2_COLOR = "#E8D44D"; // 2번째 줄(노란색)

// 제목 메트릭 기준 폭(이 폭에서 아래 px 값이 원본과 정합).
const BASE_WIDTH = 200;

export function ShortsPreviewFrame({
  titleLine1,
  titleLine2,
  titleFont = DEFAULT_TITLE_FONT,
  titleFontWeight = DEFAULT_TITLE_FONT_WEIGHT,
  titleFontSize = DEFAULT_TITLE_FONT_SIZE,
  children,
  className,
  width = BASE_WIDTH,
}: {
  titleLine1?: string;
  titleLine2?: string;
  titleFont?: string; // core.fonts id.
  titleFontWeight?: string; // 굵기 id.
  titleFontSize?: number; // 렌더 기준 px(1080폭). 미지정이면 기본 120.
  children?: ReactNode; // 미디어 배경(<img>/<video>/placeholder) — 프레임을 꽉 채우게.
  className?: string;
  width?: number; // 프레임 가로 폭(px). 높이·제목 크기는 9:16 / 비율로 자동.
}) {
  const height = Math.round((width * 16) / 9);
  const s = width / BASE_WIDTH; // 제목 위치 스케일 비율
  // 제목 폰트 크기는 렌더 기준(1080폭) px 을 프레임 폭으로 환산. size 120·width 200 이면 22px(기존값).
  const titleBase = {
    WebkitTextStroke: TITLE_STROKE,
    textShadow: TITLE_SHADOW,
    ...titleFontStyle(titleFont, titleFontWeight),
    fontSize: `${titleFontSize * (width / 1080)}px`,
  } as const;

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
          className="pointer-events-none absolute w-full whitespace-nowrap text-center font-extrabold text-white"
          style={{ ...titleBase, top: 24 * s }}
        >
          {titleLine1}
        </div>
      ) : null}
      {titleLine2 ? (
        <div
          className="pointer-events-none absolute w-full whitespace-nowrap text-center font-extrabold"
          style={{ ...titleBase, color: TITLE_LINE2_COLOR, top: 50 * s }}
        >
          {titleLine2}
        </div>
      ) : null}
    </div>
  );
}
