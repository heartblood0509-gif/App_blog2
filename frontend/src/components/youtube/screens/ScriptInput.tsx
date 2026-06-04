"use client";

// Card B 1단계 — 제목(2줄 자동분할) + 대본 붙여넣기.
// "문장으로 쪼개기" → POST /api/generate/split-script(정규식, 원문 보존) → POST /api/jobs/draft
// (user_assets draft job 생성) → 줄별 자산 편집 화면('lines')으로 이동.

import { useState } from "react";
import { Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { TITLE_MAX, autoSplitTitle, combineTitle } from "@/lib/youtube/title";
import { createDraft, splitScript } from "@/lib/youtube/endpoints";

const SCRIPT_MIN = 10; // 백엔드 SplitScriptRequest.script min_length
const SCRIPT_MAX = 5000;

export function ScriptInput() {
  const { state, update } = useYt();
  // 제목은 단일 입력 → 2줄 자동 분할. 되돌아오면 기존 값 복원.
  const [titleRaw, setTitleRaw] = useState(state.selectedTitle);
  const [script, setScript] = useState(state.scriptText);
  const [busy, setBusy] = useState(false);

  const [l1, l2] = autoSplitTitle(titleRaw.trim());
  const combined = combineTitle(l1, l2);
  const titleOver = combined.length > TITLE_MAX;
  const scriptLen = script.trim().length;
  const scriptOk = scriptLen >= SCRIPT_MIN && scriptLen <= SCRIPT_MAX;
  const canProceed = scriptOk && !titleOver && !busy;

  async function handleNext() {
    if (!canProceed) return;
    setBusy(true);
    try {
      const { lines } = await splitScript(script.trim());
      if (!lines.length) {
        toast.error("분리 가능한 문장이 없습니다. 대본을 확인해주세요.");
        setBusy(false);
        return;
      }
      const draft = await createDraft(lines);
      update({
        jobId: draft.job_id,
        scriptText: script,
        selectedTitle: combined,
        titleLine1: l1,
        titleLine2: l2,
        screen: "lines",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "대본 처리에 실패했어요.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">제목과 대본 입력</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        가지고 있는 대본을 붙여넣으면 문장 단위로 쪼개서, 줄마다 이미지를 붙일 수 있어요.
      </p>

      {/* 제목 */}
      <div className="mt-5 space-y-1.5">
        <Label htmlFor="cardb-title">영상 제목 (선택)</Label>
        <Input
          id="cardb-title"
          value={titleRaw}
          onChange={(e) => setTitleRaw(e.target.value)}
          placeholder="예: 맥주효모로 채우는 모발 영양"
          maxLength={60}
        />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {l1 || l2 ? (
              <>
                미리보기: <b>{l1}</b>
                {l2 ? (
                  <>
                    {" / "}
                    <b>{l2}</b>
                  </>
                ) : null}
              </>
            ) : (
              "두 줄로 자동 분할됩니다."
            )}
          </span>
          <span className={cn(titleOver ? "text-destructive" : "text-muted-foreground")}>
            {combined.length}/{TITLE_MAX}
          </span>
        </div>
        {titleOver && (
          <p className="text-xs text-destructive">
            제목이 너무 길어요. {TITLE_MAX}자 이하로 줄여주세요.
          </p>
        )}
      </div>

      {/* 대본 */}
      <div className="mt-5 space-y-1.5">
        <Label htmlFor="cardb-script">대본</Label>
        <Textarea
          id="cardb-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="여기에 대본 전체를 붙여넣으세요. 마침표·물음표·줄바꿈 기준으로 문장을 나눕니다."
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
          <span className={cn(scriptLen > SCRIPT_MAX ? "text-destructive" : "")}>
            {scriptLen}/{SCRIPT_MAX}
          </span>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed} className="gap-2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Scissors className="h-4 w-4" />
          )}
          {busy ? "쪼개는 중..." : "문장으로 쪼개기"}
        </Button>
      </div>
    </div>
  );
}
