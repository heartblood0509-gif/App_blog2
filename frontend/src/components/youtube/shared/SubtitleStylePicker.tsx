"use client";

// 자막 스타일 카드(작업 전역, 접이식) — BgmPicker 와 같은 카드 디자인으로 그 아래에 배치.
// 폰트/굵기/크기/색을 고른다. 위치(가로·세로)는 프리뷰에서 자막을 끌어 조절한다(별도).
// 값은 전역 state 에 즉시 반영되고, LineAssetEditor 가 draft-meta 로 디바운스 저장한다.

import { useState } from "react";
import { ChevronDown, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TITLE_FONTS,
  getTitleFont,
  normalizeWeight,
  titleFontStyle,
  SUBTITLE_FONT_SIZE_MIN,
  SUBTITLE_FONT_SIZE_MAX,
} from "@/lib/youtube/fonts";
import { TitleColorPicker } from "../TitleColorPicker";

export function SubtitleStylePicker({ disabled = false }: { disabled?: boolean }) {
  const { state, update } = useYt();
  const [open, setOpen] = useState(false);

  // 자막 폰트는 번들 4종 중 하나(빈 값/미지의 id 는 getTitleFont 가 프리텐다드로 폴백).
  const selectedFont = getTitleFont(state.subtitleFont);
  // 굵기 목록은 굵은 순(위)→얇은 순(아래).
  const weightItems = selectedFont.weights
    .slice()
    .sort((a, b) => b.cssWeight - a.cssWeight)
    .map((w) => ({ value: w.id, label: w.label }));

  return (
    <div className="rounded-lg border border-muted-foreground/20 bg-muted/50 p-3 text-card-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <Type className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">자막 스타일</span>
        <span className="text-xs text-muted-foreground">(선택)</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* 글씨체 — 번들 폰트 4종 */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">글씨체</p>
            <div className="grid grid-cols-2 gap-2">
              {TITLE_FONTS.map((f) => {
                const sel = state.subtitleFont === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      update({
                        subtitleFont: f.id,
                        subtitleFontWeight: normalizeWeight(f.id, state.subtitleFontWeight || f.defaultWeight),
                      })
                    }
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
                      sel
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    <span
                      className="text-xl leading-none text-foreground"
                      style={titleFontStyle(f.id, f.defaultWeight)}
                    >
                      가나다 Ag
                    </span>
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 굵기 — 고른 폰트가 굵기 2개 이상일 때만 */}
          {weightItems.length > 1 ? (
            <div className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">굵기</span>
              <Select
                items={weightItems}
                value={normalizeWeight(state.subtitleFont, state.subtitleFontWeight)}
                onValueChange={(v) => v && update({ subtitleFontWeight: String(v) })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weightItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* 글자 크기 */}
          <div className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">크기</span>
            <Slider
              className="flex-1"
              min={SUBTITLE_FONT_SIZE_MIN}
              max={SUBTITLE_FONT_SIZE_MAX}
              step={1}
              value={state.subtitleFontSize}
              onValueChange={(v) => update({ subtitleFontSize: v })}
              disabled={disabled}
            />
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {state.subtitleFontSize}
            </span>
          </div>

          {/* 색상 */}
          <div className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">색상</span>
            <TitleColorPicker
              value={state.subtitleColor}
              onChange={(hex) => update({ subtitleColor: hex })}
              ariaLabel="자막 색 선택"
            />
          </div>

          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            자막 위치는 위 미리보기에서 자막을 끌어 옮길 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}
