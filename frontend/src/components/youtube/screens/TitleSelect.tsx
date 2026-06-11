"use client";

// Card A 2단계 — 제목 선택. 후보(제목+훅) 카드 중 하나를 고르면 영상 오버레이용 2줄로
// 자동 분리되고, 9:16 미리보기 프레임에서 픽셀 오버플로(프레임 폭 초과)를 실시간 경고한다.
// 백엔드 narration 의 selected_title 은 30자 제한이라, 합친 길이가 넘으면 다음 진행을 막는다.
// (원본 static/js/app.js autoSplitTitle/updateTitlePreview 동작을 React 로 1:1 이식.)

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { TITLE_MAX, autoSplitTitle, combineTitle } from "@/lib/youtube/title";
import {
  TITLE_STROKE as STROKE,
  TITLE_SHADOW as SHADOW,
  TITLE_LINE2_COLOR,
} from "../ShortsPreviewFrame";

export function TitleSelect() {
  const { state, update } = useYt();
  const options = state.titleOptions;

  // 카드 하이라이트 인덱스. 되돌아왔을 때 아직 안 다듬었으면 원래 카드가 다시 선택됨.
  // (직접 편집해 selectedTitle 이 후보와 달라지면 하이라이트만 풀리고, 편집 내용/에디터는 유지.)
  const [selectedIndex, setSelectedIndex] = useState<number>(() =>
    options.findIndex((o) => o.title === state.selectedTitle),
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLDivElement>(null);
  const line2Ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // 폰트 렌더 폭 기준 오버플로 측정(scrollWidth > 프레임 폭). 원본과 동일하게 rAF 사용.
  useEffect(() => {
    const frame = frameRef.current;
    const el1 = line1Ref.current;
    const el2 = line2Ref.current;
    if (!frame || !el1 || !el2) return;
    const raf = requestAnimationFrame(() => {
      const w = frame.clientWidth;
      setOverflow(el1.scrollWidth > w || el2.scrollWidth > w);
    });
    return () => cancelAnimationFrame(raf);
  }, [state.titleLine1, state.titleLine2]);

  // 카드 하이라이트가 풀려도(직접 편집) 줄이 남아 있으면 에디터는 계속 보여준다.
  const hasSelection = selectedIndex >= 0 || state.titleLine1.trim().length > 0;
  const combined = combineTitle(state.titleLine1, state.titleLine2);
  const tooLong = combined.length > TITLE_MAX;
  const canProceed =
    hasSelection && state.titleLine1.trim().length > 0 && !tooLong;

  function handleSelect(i: number) {
    const title = options[i]?.title ?? "";
    const [l1, l2] = autoSplitTitle(title);
    setSelectedIndex(i);
    update({
      titleLine1: l1,
      titleLine2: l2,
      selectedTitle: combineTitle(l1, l2),
    });
  }

  function handleLine1(v: string) {
    update({ titleLine1: v, selectedTitle: combineTitle(v, state.titleLine2) });
  }
  function handleLine2(v: string) {
    update({ titleLine2: v, selectedTitle: combineTitle(state.titleLine1, v) });
  }

  function handleNext() {
    if (!canProceed) return;
    update({
      selectedTitle: combineTitle(state.titleLine1, state.titleLine2),
      screen: "narration",
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">2. 제목 선택</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        마음에 드는 제목을 고르면 영상에 표시될 2줄로 자동 분리됩니다. 자유롭게 다듬어 보세요.
      </p>

      {/* 제목 후보 카드 */}
      <div className="mt-5 grid gap-2.5">
        {options.map((opt, i) => {
          const selected = i === selectedIndex;
          return (
            <button
              key={`${opt.title}-${i}`}
              type="button"
              onClick={() => handleSelect(i)}
              className={cn(
                "rounded-lg border p-3.5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-background hover:border-primary/40 hover:bg-muted/50",
              )}
            >
              <div className="text-sm font-semibold">{opt.title}</div>
              {opt.hook && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {opt.hook}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 2줄 분할 편집 + 9:16 미리보기 */}
      {hasSelection && (
        <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">
            영상 표시 제목 (2줄)
          </p>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row">
            {/* 미리보기 프레임 (9:16) */}
            <div
              ref={frameRef}
              className={cn(
                "relative h-[356px] w-[200px] flex-shrink-0 overflow-hidden rounded-xl border bg-[#0a0a14]",
                overflow ? "border-destructive" : "border-border",
              )}
            >
              <div
                ref={line1Ref}
                className="absolute top-6 w-full whitespace-nowrap text-center text-[22px] font-extrabold text-white"
                style={{ WebkitTextStroke: STROKE, textShadow: SHADOW }}
              >
                {state.titleLine1}
              </div>
              <div
                ref={line2Ref}
                className="absolute top-[50px] w-full whitespace-nowrap text-center text-[22px] font-extrabold"
                style={{
                  color: TITLE_LINE2_COLOR,
                  WebkitTextStroke: STROKE,
                  textShadow: SHADOW,
                }}
              >
                {state.titleLine2}
              </div>
              <div className="absolute top-[78px] left-0 h-[200px] w-full border-y border-dashed border-white/15 bg-white/5" />
              {overflow && (
                <div className="absolute bottom-2 w-full text-center text-sm font-semibold text-destructive">
                  프레임을 벗어나요
                </div>
              )}
            </div>

            {/* 줄 입력 */}
            <div className="flex flex-1 flex-col justify-center gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="yt-title-line1">1번째 줄 (흰색)</Label>
                <Input
                  id="yt-title-line1"
                  maxLength={30}
                  value={state.titleLine1}
                  onChange={(e) => handleLine1(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="yt-title-line2">2번째 줄 (노란색)</Label>
                <Input
                  id="yt-title-line2"
                  maxLength={30}
                  value={state.titleLine2}
                  onChange={(e) => handleLine2(e.target.value)}
                />
              </div>
              <p
                className={cn(
                  "text-xs",
                  tooLong ? "text-destructive" : "text-muted-foreground",
                )}
              >
                합쳐서 {combined.length}/{TITLE_MAX}자
                {tooLong && " — 30자 이하로 줄여주세요"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed} className="gap-2">
          나레이션 만들기
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
