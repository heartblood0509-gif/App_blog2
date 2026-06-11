"use client";

// Card A 4단계 — 음성 설정. 성우/감정/속도를 고르고 샘플을 미리듣는다.
// 일반 Card A(정보·홍보)는 여기서 TTS 세션을 만들지 않는다 — 영상 렌더 때 생성(tts_session_id=null).
// promo_comment 만 "음성 만들기" 시 preview-build 로 세션 + expanded_sentences 를 미리 만들어 둔다
// (음성 단계에서 6초 초과 줄이 분리될 수 있어, 그 분리 결과로 이미지 컷 수를 맞춰야 하기 때문).

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { TTS_ENGINE, VOICE_OPTIONS } from "@/lib/youtube/voices";
import {
  getDraftState,
  ttsEmotions,
  ttsPreviewBlob,
  ttsPreviewBuild,
  type TtsEmotion,
} from "@/lib/youtube/endpoints";

const SELECT_CLS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function TtsConfig() {
  const { state, update } = useYt();

  const isUserAssets = state.mode === "user_assets";
  const isCosmetics = state.category === "cosmetics";
  const isPromoComment = isCosmetics && state.contentType === "promo_comment";

  const [emotions, setEmotions] = useState<TtsEmotion[]>([]);
  const [emotionsLoading, setEmotionsLoading] = useState(false);
  const [preview, setPreview] = useState<"idle" | "loading" | "playing">("idle");
  const [building, setBuilding] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 성우가 바뀌면 그 성우의 감정 목록을 불러온다(typecast 전용). 키 없으면 빈 목록 → 기본 음색만.
  useEffect(() => {
    if (!state.voiceId) return;
    let cancelled = false;
    (async () => {
      setEmotionsLoading(true);
      try {
        const list = await ttsEmotions(state.voiceId);
        if (!cancelled) setEmotions(list);
      } catch {
        if (!cancelled) setEmotions([]);
      } finally {
        if (!cancelled) setEmotionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.voiceId]);

  // 언마운트 시 미리듣기 오디오 + objectURL 정리.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  // 음성 설정이 바뀌면 기존 TTS 세션 무효화(promo_comment 재빌드 필요 신호).
  function patchInvalidate(patch: Parameters<typeof update>[0]) {
    update({ ...patch, ttsSessionId: null, expandedSentences: null });
  }

  function releaseUrl() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  function stopPreview() {
    audioRef.current?.pause();
    audioRef.current = null;
    releaseUrl();
    setPreview("idle");
  }

  async function togglePreview() {
    if (preview === "playing") {
      stopPreview();
      return;
    }
    if (preview === "loading" || !state.voiceId) return;
    setPreview("loading");
    try {
      const blob = await ttsPreviewBlob({
        engine: TTS_ENGINE,
        voice_id: state.voiceId,
        speed: state.ttsSpeed,
        emotion: state.emotion,
      });
      // 요청 중 화면을 떠났으면 재생하지 않고 정리.
      if (!mountedRef.current) return;
      releaseUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        releaseUrl();
        audioRef.current = null;
        if (mountedRef.current) setPreview("idle");
      };
      await audio.play();
      if (mountedRef.current) setPreview("playing");
    } catch (e) {
      releaseUrl();
      if (mountedRef.current) {
        toast.error(errMessage(e, "미리듣기에 실패했습니다. (Typecast 키 확인)"));
        setPreview("idle");
      }
    }
  }

  async function handleNext() {
    if (building) return;
    if (!state.voiceId) {
      toast.error("성우를 선택해주세요.");
      return;
    }
    stopPreview();

    // Card B(user_assets): 줄 텍스트로 TTS 세션을 **미리** 만든다(confirm 때 필수).
    // line_ids·existing_session_id 를 보내 incremental 재빌드 활성화(변경 없으면 Typecast 0회).
    if (isUserAssets) {
      if (!state.jobId) {
        toast.error("작업을 찾을 수 없어요. 대본 단계부터 다시 진행해주세요.");
        return;
      }
      setBuilding(true);
      try {
        const ds = await getDraftState(state.jobId);
        const lines = ds.lines ?? [];
        if (lines.length === 0) {
          toast.error("대본 줄이 없어요. 대본 단계부터 다시 진행해주세요.");
          return;
        }
        const notReady = lines.findIndex((l) => l.status !== "ready");
        if (notReady >= 0) {
          toast.error(`${notReady + 1}번째 줄의 이미지가 아직 준비되지 않았어요.`);
          update({ screen: "lines" });
          return;
        }
        const data = await ttsPreviewBuild({
          sentences: lines.map((l) => l.text.trim()),
          voice_id: state.voiceId,
          speed: state.ttsSpeed,
          emotion: state.emotion,
          content_type: "user_assets",
          topic: state.selectedTitle,
          style: "realistic",
          line_ids: lines.map((l) => l.line_id ?? null),
          existing_session_id: state.ttsSessionId,
        });
        // 음성 재빌드 완료 → dirty 해제(이제 자막과 음성이 일치).
        update({ ttsSessionId: data.session_id, ttsDirty: false, screen: "bgm" });
      } catch (e) {
        toast.error(errMessage(e, "음성 생성에 실패했습니다."));
      } finally {
        if (mountedRef.current) setBuilding(false);
      }
      return;
    }

    // 일반 Card A: 세션을 미리 안 만든다(렌더 때 생성). 바로 BGM 으로.
    if (!isPromoComment) {
      update({ screen: "bgm" });
      return;
    }
    // promo_comment: 설정이 그대로면(세션 살아있음) 재빌드 생략.
    if (state.ttsSessionId) {
      update({ screen: "bgm" });
      return;
    }

    const sentences = state.narration.map((l) => l.text.trim());
    if (sentences.length === 0 || sentences.some((s) => !s)) {
      toast.error("나레이션을 먼저 확정해주세요.");
      return;
    }
    setBuilding(true);
    try {
      const data = await ttsPreviewBuild({
        sentences,
        voice_id: state.voiceId,
        speed: state.ttsSpeed,
        emotion: state.emotion,
        content_type: "promo_comment",
        topic: state.topic.trim(),
        style: "realistic",
      });
      update({
        ttsSessionId: data.session_id,
        ttsDirty: false,
        expandedSentences: data.expanded_sentences ?? sentences,
        screen: "bgm",
      });
    } catch (e) {
      toast.error(errMessage(e, "음성 생성에 실패했습니다."));
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">음성 설정</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        나레이션을 읽어줄 성우와 말투, 속도를 정하세요. 샘플로 미리 들어볼 수 있어요.
      </p>

      <div className="mt-5 space-y-5">
        {/* 엔진(현재 typecast 단일) + 성우 */}
        <div className="grid gap-1.5">
          <Label htmlFor="yt-voice">성우</Label>
          <select
            id="yt-voice"
            className={SELECT_CLS}
            value={state.voiceId}
            onChange={(e) =>
              patchInvalidate({ voiceId: e.target.value, emotion: "normal" })
            }
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">엔진: Typecast (고품질)</p>
        </div>

        {/* 감정 */}
        <div className="grid gap-1.5">
          <Label>감정 / 말투</Label>
          {emotionsLoading ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 감정 목록 불러오는 중...
            </p>
          ) : emotions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              감정 목록을 불러오지 못했어요. 기본 음색으로 진행됩니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {emotions.map((emo) => {
                const active = state.emotion === emo.value;
                return (
                  <button
                    key={emo.value}
                    type="button"
                    onClick={() => patchInvalidate({ emotion: emo.value })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {emo.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 속도 */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>읽는 속도</Label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {state.ttsSpeed.toFixed(2)}×
            </span>
          </div>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={state.ttsSpeed}
            onValueChange={(v) => patchInvalidate({ ttsSpeed: v })}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>느리게 0.5×</span>
            <span>빠르게 2.0×</span>
          </div>
        </div>

        {/* 미리듣기 */}
        <div>
          <Button
            variant="outline"
            onClick={togglePreview}
            disabled={preview === "loading" || !state.voiceId}
            className="gap-2"
          >
            {preview === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : preview === "playing" ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {preview === "playing" ? "정지" : "샘플 미리듣기"}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleNext} disabled={building} className="gap-2">
          {building ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {building ? "음성 만드는 중..." : "BGM 설정으로"}
        </Button>
      </div>
    </div>
  );
}
