"use client";

// 레이아웃 카드(작업 전역, 접이식) — SubtitleStylePicker 와 같은 카드 디자인으로 그 아래에 배치.
// 미디어를 화면에 어떻게 앉힐지 고른다: "기본"(레이아웃 없음) / "상·하 박스" / "흐림 배경".
// 값은 전역 state 에 즉시 반영되고, LineAssetEditor 가 draft-meta 로 디바운스 저장한다.
// 레이아웃 선택 시 onSelect 로 LineAssetEditor 가 '안 건드린' 줄을 그 레이아웃 기본 배치로 정렬한다
// (기본=cover 꽉채움, 박스·흐림=contain 좌우맞춤). 사용자가 손댄 줄은 보존.
// 새 레이아웃을 추가하려면 LAYOUT_OPTIONS 에 항목을 넣고 LayoutMode 유니언 + 백엔드
// apply_layout_mode 허용값만 확장하면 된다.

import { useState, type ReactNode } from "react";
import { ChevronDown, LayoutTemplate, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  type LayoutMode,
  LAYOUT_BAND_TOP_FRAC,
  LAYOUT_BAND_MID_FRAC,
  BLUR_PCT_MIN,
  BLUR_PCT_MAX,
  BLUR_PCT_STEP,
  BLUR_PCT_DEFAULT,
  sigmaFromBlurPct,
  blurPctFromSigma,
} from "@/lib/youtube/layout";

// 미니 9:16 도식 — 실제 영상 모습을 아주 작게 흉내낸다(aria-hidden, 설명은 카드 라벨이 담당).
// 회색 그라디언트=미디어, 흰/노란 바=제목, 흰 바=자막.
function Thumb({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative mx-auto aspect-[9/16] w-12 overflow-hidden rounded-[3px] bg-black"
    >
      {children}
    </div>
  );
}

const MEDIA_CLASS = "absolute inset-x-0 bg-gradient-to-br from-zinc-400 to-zinc-600";
const TITLE_BAR = "absolute left-1/2 h-[3px] -translate-x-1/2 rounded-full";
const SUB_BAR = "absolute left-1/2 h-[2px] w-1/2 -translate-x-1/2 rounded-full bg-white/90";

interface LayoutOptionDef {
  id: LayoutMode;
  label: string;
  desc: string;
  Thumb: () => ReactNode;
}

const LAYOUT_OPTIONS: LayoutOptionDef[] = [
  {
    id: "full",
    label: "기본",
    desc: "레이아웃 없이 미디어를 화면에 채워요",
    Thumb: () => (
      <Thumb>
        {/* 미디어가 전체를 덮음 */}
        <div className={cn(MEDIA_CLASS, "inset-y-0")} />
        {/* 제목 2줄 + 자막 */}
        <div className={cn(TITLE_BAR, "top-[16%] w-3/5 bg-white/90")} />
        <div className={cn(TITLE_BAR, "top-[22%] w-2/5 bg-yellow-300/90")} />
        <div className={cn(SUB_BAR, "top-[68%]")} />
      </Thumb>
    ),
  },
  {
    id: "boxed",
    label: "상·하 박스",
    desc: "위·아래 검정 박스, 글자는 박스 위에",
    Thumb: () => (
      <Thumb>
        {/* 가운데 밴드에만 미디어, 위·아래는 검정(Thumb 배경) */}
        <div
          className={MEDIA_CLASS}
          style={{ top: `${LAYOUT_BAND_TOP_FRAC * 100}%`, height: `${LAYOUT_BAND_MID_FRAC * 100}%` }}
        />
        {/* 제목은 상단 박스 위, 자막은 하단 박스 안 */}
        <div className={cn(TITLE_BAR, "top-[9%] w-3/5 bg-white/90")} />
        <div className={cn(TITLE_BAR, "top-[15%] w-2/5 bg-yellow-300/90")} />
        <div className={cn(SUB_BAR, "top-[86%]")} />
      </Thumb>
    ),
  },
  {
    id: "blur",
    label: "흐림 배경",
    desc: "빈 공간을 흐린 배경으로",
    Thumb: () => (
      <Thumb>
        {/* 흐린 배경(전체) + 그 위 가운데 선명한 미디어(fit) */}
        <div className={cn(MEDIA_CLASS, "inset-y-0 scale-110 opacity-70 blur-[2px]")} />
        <div
          className={cn(MEDIA_CLASS, "left-[15%] right-[15%] from-zinc-300 to-zinc-500")}
          style={{ top: `${LAYOUT_BAND_TOP_FRAC * 100}%`, height: `${LAYOUT_BAND_MID_FRAC * 100}%` }}
        />
        <div className={cn(TITLE_BAR, "top-[16%] w-3/5 bg-white/90")} />
        <div className={cn(TITLE_BAR, "top-[22%] w-2/5 bg-yellow-300/90")} />
        <div className={cn(SUB_BAR, "top-[68%]")} />
      </Thumb>
    ),
  },
];

// 접힌 헤더에 표시할 비기본 모드 라벨(기본 full 은 감춤 — 소음 방지).
const MODE_SUMMARY: Partial<Record<LayoutMode, string>> = {
  boxed: "상·하 박스",
  blur: "흐림 배경",
};

export function LayoutPicker({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect?: (mode: LayoutMode) => void;
}) {
  const { state, update } = useYt();
  const [open, setOpen] = useState(false);
  const mode: LayoutMode = state.layoutMode ?? "full";
  const summary = MODE_SUMMARY[mode];

  return (
    <div className="rounded-lg border border-muted-foreground/20 bg-muted/50 p-3 text-card-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">레이아웃</span>
        <span className="text-xs text-muted-foreground">(선택)</span>
        {/* 접힌 상태에서도 비기본 설정 중임이 보이게 — 기본(full)이면 소음이라 감춤 */}
        {summary ? <span className="ml-auto text-xs text-primary">{summary}</span> : null}
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            summary ? "ml-1" : "ml-auto",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {LAYOUT_OPTIONS.map((opt) => {
              const sel = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (sel) return; // 이미 고른 레이아웃 재클릭 → 무시(불필요한 재정렬·초안 폐기 방지)
                    update({ layoutMode: opt.id });
                    onSelect?.(opt.id);
                  }}
                  aria-pressed={sel}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center transition-colors",
                    sel
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <opt.Thumb />
                  <span className="text-xs font-medium text-foreground">{opt.label}</span>
                  <span className="text-[0.7rem] leading-tight text-muted-foreground">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          {/* 흐림 강도 — blur 모드에서만. 모션 속도 슬라이더와 같은 패턴(% 표시 + 원래대로). */}
          {mode === "blur" ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">흐림</span>
              <Slider
                className="flex-1"
                min={BLUR_PCT_MIN}
                max={BLUR_PCT_MAX}
                step={BLUR_PCT_STEP}
                value={blurPctFromSigma(state.blurSigma)}
                onValueChange={(v) => update({ blurSigma: sigmaFromBlurPct(Number(v)) })}
                disabled={disabled}
              />
              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {blurPctFromSigma(state.blurSigma)}%
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground"
                onClick={() => update({ blurSigma: sigmaFromBlurPct(BLUR_PCT_DEFAULT) })}
                disabled={blurPctFromSigma(state.blurSigma) === BLUR_PCT_DEFAULT}
                title="흐림 강도를 기본(100%)으로 되돌려요"
              >
                <RotateCcw className="size-3" /> 원래대로
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
