"use client";

// Card B 1단계 — 제목 입력(2줄, 실시간 9:16 프리뷰) + 대본 붙여넣기(글자 수).
// 원본 쇼츠픽의 "1. 제목 입력 / 2. 대본 입력" 두 섹션을 1:1 이식.
// "문장으로 쪼개기" → POST /api/generate/split-script(정규식, 원문 보존) → POST /api/jobs/draft
// (user_assets draft job 생성) → 줄별 자산 편집 화면('lines')으로 이동.
//
// 제목은 윗줄(흰색)/아랫줄(노란색) 두 입력을 직접 받는다. 프리뷰 프레임의 오버플로 감지
// (scrollWidth)는 TitleSelect(Card A, 현재 비활성) 와 동일 패턴 — 향후 공통 컴포넌트로 추출 여지.
// 제목은 선택: 비워도 진행 가능(제목 없으면 최종 영상에서 오버레이 생략).

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { autoSplitTitle, combineTitle } from "@/lib/youtube/title";
import { ShortsPreviewFrame } from "../ShortsPreviewFrame";
import { TitleColorPicker } from "../TitleColorPicker";
import {
  TITLE_FONTS,
  TITLE_FONT_SIZE_MIN,
  TITLE_FONT_SIZE_MAX,
  TITLE_LINE_GAP_MIN,
  TITLE_LINE_GAP_MAX,
  getTitleFont,
  titleFontStyle,
  normalizeWeight,
} from "@/lib/youtube/fonts";
import { saveLastUsed } from "@/lib/youtube/title-defaults";
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

  // 제목 줄이 프레임 폭을 넘는지 — ShortsPreviewFrame 이 측정해 콜백으로 알려준다(경고 표시용).
  const [overflow, setOverflow] = useState(false);

  // 스타일 변경을 "이 기기 마지막 스타일"로 자동 기억(디바운스). 새 영상은 이 값으로 시작.
  useEffect(() => {
    saveLastUsed({
      font: state.titleFont,
      weight: state.titleFontWeight,
      size: state.titleFontSize,
      line1Size: state.titleLine1Size,
      line2Size: state.titleLine2Size,
      lineGap: state.titleLineGap,
      color1: state.titleColor1,
      color2: state.titleColor2,
    });
  }, [
    state.titleFont,
    state.titleFontWeight,
    state.titleFontSize,
    state.titleLine1Size,
    state.titleLine2Size,
    state.titleLineGap,
    state.titleColor1,
    state.titleColor2,
  ]);

  const selectedFont = getTitleFont(state.titleFont);
  // 굵기 목록은 굵은 순(위)→얇은 순(아래)으로 표시.
  const weightItems = selectedFont.weights
    .slice()
    .reverse()
    .map((w) => ({ value: w.id, label: w.label }));

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

  // 기존 작업(jobId 보유)에서 대본을 고쳤지만 아직 반영(쪼개기/다음) 안 한 상태를 전역에 게시한다.
  // Stepper 가 이 값을 보고 단계 이탈 시 "미저장 편집이 사라진다"고 경고한다(신규 작업은 잃을 게 없어 제외).
  useEffect(() => {
    const dirty = !!state.jobId && script.trim() !== state.scriptText.trim();
    if (dirty !== state.scriptDraftDirty) update({ scriptDraftDirty: dirty });
  }, [script, state.scriptText, state.jobId, state.scriptDraftDirty, update]);

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
            title_font: state.titleFont,
            title_font_weight: state.titleFontWeight,
            title_font_size: state.titleFontSize,
            title_line1_size: state.titleLine1Size,
            title_line2_size: state.titleLine2Size,
            title_line_gap: state.titleLineGap,
            title_color1: state.titleColor1,
            title_color2: state.titleColor2,
            title_dx: state.titleDx,
            title_dy: state.titleDy,
          });
          update({
            selectedTitle: combineTitle(n1, n2),
            titleLine1: n1,
            titleLine2: n2,
            scriptDraftDirty: false, // 제목만 저장(대본 미변경) — 이탈 경고 해제
            screen: "lines",
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "제목 저장에 실패했어요.");
          setBusy(false);
        }
        return;
      }
      const ok = window.confirm(
        "대본을 바꾸면 지금까지 만든 줄별 이미지·영상·음성이 사라지고 처음부터 다시 만들어집니다.\n\n계속할까요? (줄 하나만 살짝 고치려면 취소하고 '화면·소리' 단계에서 수정하세요.)",
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
      const draft = await createDraft(
        lines,
        n1,
        n2,
        state.titleFont,
        state.titleFontWeight,
        state.titleFontSize,
        state.titleColor1,
        state.titleColor2,
        state.titleLine1Size,
        state.titleLine2Size,
        state.titleLineGap,
        state.titleDx,
        state.titleDy,
      );
      update({
        jobId: draft.job_id,
        scriptText: script,
        scriptDraftDirty: false, // 새 대본을 반영(재쪼개기)했으니 이탈 경고 해제
        selectedTitle: combineTitle(n1, n2),
        titleLine1: n1,
        titleLine2: n2,
        // 새 draft → 이전 job 의 음성 세션/스냅샷을 버린다(안 그러면 옛 세션에 잘못 증분 빌드).
        ttsSessionId: null,
        ttsDirty: false,
        ttsBuild: null,
        expandedSentences: null,
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
        <h2 className="text-lg font-semibold">1. 제목 입력 (선택)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          제목은 선택이에요. 비워두면 영상에 제목 없이 만들어집니다.
        </p>

        <div className="mt-4 flex flex-col gap-6 sm:flex-row">
          {/* 미리보기 = 화면·소리 단계와 동일한 ShortsPreviewFrame(단일 출처). 이 단계엔 미디어가
              없어 가운데는 체커보드 밴드로, 상단엔 썸네일 잘림선을 표시(showChecker/showThumbCrop).
              제목은 드래그로 한 덩어리 이동 + 가로중앙/기본높이 마그네틱(onTitlePosChange).
              줄별 크기·간격은 최종 렌더와 동일 공식으로 그려 WYSIWYG. */}
          <div className="flex-shrink-0">
            <ShortsPreviewFrame
              width={250}
              titleLine1={state.titleLine1}
              titleLine2={state.titleLine2}
              titleFont={state.titleFont}
              titleFontWeight={state.titleFontWeight}
              titleColor1={state.titleColor1}
              titleColor2={state.titleColor2}
              titleLine1Size={state.titleLine1Size}
              titleLine2Size={state.titleLine2Size}
              titleLineGap={state.titleLineGap}
              titleDx={state.titleDx}
              titleDy={state.titleDy}
              onTitlePosChange={(dx, dy) => update({ titleDx: dx, titleDy: dy })}
              onOverflowChange={setOverflow}
              showChecker
              showThumbCrop
              className={cn(overflow && "border-destructive")}
            />
            {overflow && (
              <p className="mt-1.5 text-center text-sm font-semibold text-destructive">
                제목이 프레임을 벗어나요
              </p>
            )}
            <p className="mt-1 text-center text-xs tabular-nums text-muted-foreground">
              위치 가로 {state.titleDx} · 세로 {state.titleDy}
            </p>
          </div>

          {/* 오른쪽: 입력칸(위) → 글씨체 → 굵기 → 크기 슬라이더 3개. 내용이 미리보기(444)보다
              길어질 수 있어 고정높이를 두지 않고 자연 스택 — 카드가 내용에 맞춰 아래로 늘어난다. */}
          <div className="flex flex-1 flex-col gap-4">
            {/* 제목 2줄 입력 */}
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cardb-title-line1">제목 첫 줄</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="cardb-title-line1"
                    maxLength={30}
                    value={state.titleLine1}
                    onChange={(e) => handleLine1(e.target.value)}
                    placeholder="예: 얼굴 빨개지는"
                  />
                  <TitleColorPicker
                    value={state.titleColor1}
                    onChange={(hex) => update({ titleColor1: hex })}
                    ariaLabel="제목 첫 줄 색 선택"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cardb-title-line2">제목 둘째 줄</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="cardb-title-line2"
                    maxLength={30}
                    value={state.titleLine2}
                    onChange={(e) => handleLine2(e.target.value)}
                    placeholder="예: 의외의 진짜 이유"
                  />
                  <TitleColorPicker
                    value={state.titleColor2}
                    onChange={(hex) => update({ titleColor2: hex })}
                    ariaLabel="제목 둘째 줄 색 선택"
                  />
                </div>
              </div>
            </div>

            {/* 제목 글씨체 */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">제목 폰트</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {TITLE_FONTS.map((f) => {
                  const sel = state.titleFont === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      // 폰트를 바꾸면 굵기는 그 폰트가 가진 것으로 정규화(없으면 그 폰트 기본 굵기).
                      onClick={() =>
                        update({
                          titleFont: f.id,
                          titleFontWeight: normalizeWeight(f.id, state.titleFontWeight),
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

            {/* 굵기 — 고른 폰트가 실제 가진 굵기만(원래 굵기 이름 그대로). */}
            <div className="flex items-center gap-3">
              <Label htmlFor="cardb-title-weight" className="text-sm font-medium">
                굵기
              </Label>
              <Select
                items={weightItems}
                value={state.titleFontWeight}
                onValueChange={(v) => v && update({ titleFontWeight: v })}
              >
                <SelectTrigger id="cardb-title-weight" className="h-9 flex-1">
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

            {/* 글자 크기(줄별) + 줄 간격. 첫 줄 크기는 레거시 앵커(title_font_size)와 동기화. */}
            <div className="flex items-center gap-3">
              <p className="w-20 whitespace-nowrap text-sm font-medium text-foreground">첫 줄 크기</p>
              <Slider
                className="flex-1"
                min={TITLE_FONT_SIZE_MIN}
                max={TITLE_FONT_SIZE_MAX}
                step={2}
                value={state.titleLine1Size}
                onValueChange={(v) => update({ titleLine1Size: v, titleFontSize: v })}
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {state.titleLine1Size}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="w-20 whitespace-nowrap text-sm font-medium text-foreground">둘째 줄 크기</p>
              <Slider
                className="flex-1"
                min={TITLE_FONT_SIZE_MIN}
                max={TITLE_FONT_SIZE_MAX}
                step={2}
                value={state.titleLine2Size}
                onValueChange={(v) => update({ titleLine2Size: v })}
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {state.titleLine2Size}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="w-20 whitespace-nowrap text-sm font-medium text-foreground">줄 간격</p>
              <Slider
                className="flex-1"
                min={TITLE_LINE_GAP_MIN}
                max={TITLE_LINE_GAP_MAX}
                step={4}
                value={state.titleLineGap}
                onValueChange={(v) => update({ titleLineGap: v })}
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {state.titleLineGap}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 대본 입력 */}
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">2. 대본 입력 (필수)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          미리 준비한 대본을 그대로 붙여 넣어주세요.
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
