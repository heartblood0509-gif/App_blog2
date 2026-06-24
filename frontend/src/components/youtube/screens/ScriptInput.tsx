"use client";

// Card B 1단계 — 제목 입력(2줄, 실시간 9:16 프리뷰) + 대본 붙여넣기(글자 수).
// 원본 쇼츠픽의 "1. 제목 입력 / 2. 대본 입력" 두 섹션을 1:1 이식.
// "문장으로 쪼개기" → POST /api/generate/split-script(정규식, 원문 보존) → POST /api/jobs/draft
// (user_assets draft job 생성) → 줄별 자산 편집 화면('lines')으로 이동.
//
// 제목은 윗줄(흰색)/아랫줄(노란색) 두 입력을 직접 받는다. 프리뷰 프레임의 오버플로 감지
// (scrollWidth)는 TitleSelect(Card A, 현재 비활성) 와 동일 패턴 — 향후 공통 컴포넌트로 추출 여지.
// 제목은 선택: 비워도 진행 가능(제목 없으면 최종 영상에서 오버레이 생략).

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { autoSplitTitle, combineTitle } from "@/lib/youtube/title";
import {
  TITLE_STROKE as STROKE,
  TITLE_SHADOW as SHADOW,
  TITLE_LINE2_COLOR,
} from "../ShortsPreviewFrame";
import { createDraft, saveDraftMeta, splitScript } from "@/lib/youtube/endpoints";

const SCRIPT_MIN = 10; // 백엔드 SplitScriptRequest.script min_length
const SCRIPT_MAX = 5000;

export function ScriptInput() {
  const { state, update } = useYt();
  const [script, setScript] = useState(state.scriptText);
  const [busy, setBusy] = useState(false);

  // 되돌아오기(스텝퍼) 시 사용자가 정한 두 줄을 그대로 복원한다. 두 줄이 모두 비어 있고
  // 합친 제목만 남아 있는 경우(레거시)에만 한 번 자동 분할로 채운다.
  useEffect(() => {
    if (
      !state.titleLine1 &&
      !state.titleLine2 &&
      state.selectedTitle.trim()
    ) {
      const [l1, l2] = autoSplitTitle(state.selectedTitle.trim());
      update({ titleLine1: l1, titleLine2: l2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 폰트 렌더 폭 기준 오버플로 측정(scrollWidth > 프레임 폭). 원본/ TitleSelect 와 동일하게 rAF.
  const frameRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLDivElement>(null);
  const line2Ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
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

  function handleLine1(v: string) {
    update({ titleLine1: v, selectedTitle: combineTitle(v, state.titleLine2) });
  }
  function handleLine2(v: string) {
    update({ titleLine2: v, selectedTitle: combineTitle(state.titleLine1, v) });
  }

  const scriptLen = script.trim().length;
  const scriptOk = scriptLen >= SCRIPT_MIN && scriptLen <= SCRIPT_MAX;
  const canProceed = scriptOk && !busy; // 제목은 진행을 막지 않는다(선택).
  // 기존 작업을 다시 열어 이 단계로 돌아왔고 대본을 안 고친 경우 — 재쪼개기 없이 "다음".
  const scriptUnchanged =
    !!state.jobId && script.trim() === state.scriptText.trim();

  async function handleNext() {
    if (!canProceed) return;

    // 윗줄만/아랫줄만 입력한 경우 정규화 — 렌더러는 윗줄(title_line1)이 있어야 제목을 얹는다.
    const t1 = state.titleLine1.trim();
    const t2 = state.titleLine2.trim();
    const [n1, n2] = t1 ? [t1, t2] : [t2, ""];

    // 기존 작업(jobId 보유)을 다시 열어 돌아온 경우:
    //  · 대본 미변경 → 재쪼개기 없이 제목만 draft 에 저장하고 자산 단계로(자산 100% 보존).
    //  · 대본 변경 → 줄별 자산이 전부 사라지므로 경고 후에만 새로 시작.
    if (state.jobId) {
      if (scriptUnchanged) {
        setBusy(true);
        try {
          await saveDraftMeta(state.jobId, {
            title: combineTitle(n1, n2),
            title_line1: n1,
            title_line2: n2,
          });
          update({
            selectedTitle: combineTitle(n1, n2),
            titleLine1: n1,
            titleLine2: n2,
            screen: "lines",
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "제목 저장에 실패했어요.");
          setBusy(false);
        }
        return;
      }
      const ok = window.confirm(
        "대본을 바꾸면 지금까지 만든 줄별 이미지·영상·음성이 사라지고 처음부터 다시 만들어집니다.\n\n계속할까요? (줄 하나만 살짝 고치려면 취소하고 '자산' 단계에서 수정하세요.)",
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const { lines } = await splitScript(script.trim());
      if (!lines.length) {
        toast.error("분리 가능한 문장이 없습니다. 대본을 확인해주세요.");
        setBusy(false);
        return;
      }
      const draft = await createDraft(lines, n1, n2);
      update({
        jobId: draft.job_id,
        scriptText: script,
        selectedTitle: combineTitle(n1, n2),
        titleLine1: n1,
        titleLine2: n2,
        screen: "lines",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "대본 처리에 실패했어요.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. 제목 입력 */}
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">1. 제목 입력</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          영상 상단에 흰색·노란색 2줄로 표시됩니다.
        </p>

        <p className="mt-4 text-sm font-medium text-foreground">
          영상에 표시될 제목 (2줄)
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
              <Label htmlFor="cardb-title-line1">윗줄</Label>
              <Input
                id="cardb-title-line1"
                maxLength={30}
                value={state.titleLine1}
                onChange={(e) => handleLine1(e.target.value)}
                placeholder="예: 얼굴 빨개지는"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cardb-title-line2">아랫줄</Label>
              <Input
                id="cardb-title-line2"
                maxLength={30}
                value={state.titleLine2}
                onChange={(e) => handleLine2(e.target.value)}
                placeholder="예: 의외의 진짜 이유"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              제목은 선택이에요. 비워두면 영상에 제목 없이 만들어집니다.
            </p>
          </div>
        </div>
      </div>

      {/* 2. 대본 입력 */}
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">2. 대본 입력</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          미리 준비한 대본을 그대로 붙여 넣어주세요. 1차로 문장 단위 자동 분리가 되며, 카드
          단계에서 <b>Enter</b> 키를 치면 그 자리에서 카드를 더 잘게 나눌 수 있습니다.
        </p>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="cardb-script">대본</Label>
          <Textarea
            id="cardb-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="여기에 대본을 입력하거나 붙여넣기 하세요 (최대 5000자)."
            rows={10}
            maxLength={SCRIPT_MAX}
            className="resize-y"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {scriptLen < SCRIPT_MIN
                ? `최소 ${SCRIPT_MIN}자 이상 입력하세요.`
                : "마침표·물음표·느낌표·줄바꿈으로 문장을 나눕니다."}
            </span>
            <span>
              {script.length}자 / 최대 {SCRIPT_MAX}자
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleNext} disabled={!canProceed} className="gap-2">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : scriptUnchanged ? (
              <ArrowRight className="h-4 w-4" />
            ) : (
              <Scissors className="h-4 w-4" />
            )}
            {busy
              ? scriptUnchanged
                ? "저장 중..."
                : "쪼개는 중..."
              : scriptUnchanged
                ? "다음"
                : "문장으로 쪼개기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
