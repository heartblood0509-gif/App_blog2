"use client";

// Card A 3단계 — 나레이션 확인. 화면에 들어오면 선택된 제목 기반으로 나레이션을 생성하고
// 줄별로 다듬을 수 있게 보여준다(줄당 28자 권장, 구두점 제외 기준 — 원본과 동일).
// "확정" 시 (promo_comment 제외) 이미지 프롬프트를 생성해 scriptLines 로 저장하고 음성 단계로.
// promo_comment 는 음성 단계에서 6초 초과 줄이 분리될 수 있어 이미지 프롬프트를 BGM 단계로 연기한다.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import {
  categoryFields,
  generateImagePrompts,
  generateNarration,
} from "@/lib/youtube/endpoints";

// 글자수: 구두점 제외(원본과 동일). 28자 초과 시 경고.
const CHAR_LIMIT = 28;
function visibleLen(text: string): number {
  return text.replace(/[?,!.~…]/g, "").length;
}

// role → 사람이 읽는 라벨(원본 roleLabels).
const ROLE_LABELS: Record<string, string> = {
  hook: "Hook",
  problem: "문제",
  insight: "핵심",
  solution1: "해결 1",
  solution2: "해결 2",
  cta: "CTA",
  line1: "1",
  line2: "2",
  line3: "3",
  line4: "4",
};

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function NarrationReview() {
  const { state, update } = useYt();

  const isCosmetics = state.category === "cosmetics";
  const isPromoComment = isCosmetics && state.contentType === "promo_comment";

  // 처음 들어왔을 때(나레이션 없음)만 자동 생성. 되돌아오면 기존 내용 유지.
  const [loading, setLoading] = useState(() => state.narration.length === 0);
  const [approving, setApproving] = useState(false);
  const startedRef = useRef(false);

  // info 타입에서 제목 생성 후 키워드가 달라졌는지(원본 confirm 경고를 비차단 배너로 이식).
  const keywordChanged =
    isCosmetics &&
    state.contentType === "info" &&
    state.keyword.trim() !== state.keywordAtTitleGen.trim();

  function catFields() {
    return categoryFields({
      category: state.category,
      contentType: state.contentType,
      painPoint: state.painPoint,
      ingredient: state.ingredient,
      keyword: state.keyword,
    });
  }

  async function fetchNarration() {
    setLoading(true);
    try {
      const { lines } = await generateNarration({
        topic: state.topic.trim(),
        selected_title: state.selectedTitle,
        num_lines: isPromoComment ? 5 : 6,
        ...catFields(),
      });
      if (!lines?.length) throw new Error("나레이션을 생성하지 못했습니다.");
      // 나레이션이 새로 생기면 하위 산출물(이미지 프롬프트/TTS 세션) 무효화.
      update({ narration: lines, scriptLines: null, ttsSessionId: null });
    } catch (e) {
      toast.error(errMessage(e, "나레이션 생성에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  // 최초 진입 시 1회 자동 생성(StrictMode 이중 실행 방지).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (state.narration.length === 0) void fetchNarration();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function editLine(index: number, text: string) {
    update({
      narration: state.narration.map((l, i) =>
        i === index ? { ...l, text } : l,
      ),
    });
  }

  async function handleApprove() {
    if (loading || approving) return;
    const texts = state.narration.map((l) => l.text.trim());
    if (texts.length === 0) {
      toast.error("먼저 나레이션을 생성해주세요.");
      return;
    }
    if (texts.some((t) => !t)) {
      toast.error("빈 나레이션 줄이 있습니다.");
      return;
    }

    // 트림된 텍스트를 narration 에 반영(확정본).
    const normalized = state.narration.map((l, i) => ({ ...l, text: texts[i] }));

    // promo_comment: 이미지 프롬프트는 BGM 단계로 연기. 바로 음성 단계로.
    if (isPromoComment) {
      update({
        narration: normalized,
        scriptLines: null,
        ttsSessionId: null,
        screen: "tts",
      });
      return;
    }

    setApproving(true);
    try {
      const { lines } = await generateImagePrompts({
        narration_lines: texts,
        style: "realistic",
        topic: state.topic.trim(),
        ...catFields(),
      });
      if (!lines?.length) throw new Error("이미지 프롬프트 생성에 실패했습니다.");
      update({
        narration: normalized,
        scriptLines: lines,
        ttsSessionId: null,
        screen: "tts",
      });
    } catch (e) {
      toast.error(errMessage(e, "이미지 프롬프트 생성에 실패했습니다."));
    } finally {
      setApproving(false);
    }
  }

  const busy = loading || approving;

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">3. 나레이션 확인</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            제목:{" "}
            <span className="font-medium text-foreground">
              {state.selectedTitle}
            </span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchNarration}
          disabled={busy}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          다시 생성
        </Button>
      </div>

      {keywordChanged && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            핵심 키워드가 제목 생성 이후 바뀌었어요(제목: &ldquo;
            {state.keywordAtTitleGen || "(비어있음)"}&rdquo; → 현재: &ldquo;
            {state.keyword.trim() || "(비어있음)"}&rdquo;). 제목과 나레이션 방향이
            어긋날 수 있으니, 어색하면 제목부터 다시 만드는 걸 권장합니다.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading && state.narration.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            나레이션 생성 중...
          </div>
        ) : (
          state.narration.map((line, i) => {
            const len = visibleLen(line.text);
            const over = len > CHAR_LIMIT;
            return (
              <div
                key={i}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    {ROLE_LABELS[line.role] ?? line.role}
                  </span>
                  {!isPromoComment && (
                    <span
                      className={cn(
                        "ml-auto tabular-nums",
                        over ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {len}/{CHAR_LIMIT}
                    </span>
                  )}
                </div>
                <Input
                  className="mt-2"
                  value={line.text}
                  onChange={(e) => editLine(i, e.target.value)}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleApprove}
          disabled={busy || state.narration.length === 0}
          className="gap-2"
        >
          {approving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {approving ? "이미지 구성 중..." : "음성 설정으로"}
        </Button>
      </div>
    </div>
  );
}
