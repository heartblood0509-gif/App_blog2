"use client";

// 화면·소리 단계 상단의 음성 설정 바 — 성우/감정/속도 + 샘플 미리듣기.
// 별도 "음성 만들기" 버튼은 없다: 실제 생성은 줄 ▶(또는 전체 미리듣기)을 누르는 순간
// LineAssetEditor 가 처리한다. 여기서 값이 바뀌면 onPatch 로 알리고(전 줄 음성 재생성 필요),
// 샘플 미리듣기는 고정 문장으로 성우 톤만 확인한다(세션과 무관).

import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { TTS_ENGINE, VOICE_OPTIONS } from "@/lib/youtube/voices";
import { ttsEmotions, ttsPreviewBlob, type TtsEmotion } from "@/lib/youtube/endpoints";

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export interface VoiceSettingsPatch {
  voiceId?: string;
  emotion?: string;
  ttsSpeed?: number;
}

export function VoiceSettingsBar({
  voiceId,
  emotion,
  ttsSpeed,
  onPatch,
  disabled,
}: {
  voiceId: string;
  emotion: string;
  ttsSpeed: number;
  onPatch: (p: VoiceSettingsPatch) => void;
  disabled?: boolean;
}) {
  const [emotions, setEmotions] = useState<TtsEmotion[]>([]);
  const [emotionsLoading, setEmotionsLoading] = useState(false);
  const [preview, setPreview] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 성우별 감정 목록(typecast). 키 없으면 빈 목록 → 기본 음색만.
  useEffect(() => {
    if (!voiceId) return;
    let cancelled = false;
    (async () => {
      setEmotionsLoading(true);
      try {
        const list = await ttsEmotions(voiceId);
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
  }, [voiceId]);

  // 언마운트 시 샘플 오디오 + objectURL 정리.
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
    if (preview === "loading" || !voiceId) return;
    setPreview("loading");
    try {
      const blob = await ttsPreviewBlob({
        engine: TTS_ENGINE,
        voice_id: voiceId,
        speed: ttsSpeed,
        emotion,
      });
      if (blob.size === 0) throw new Error("미리듣기 오디오가 비어 있습니다.");
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
      try {
        await audio.play();
      } catch (playErr) {
        console.error("[voice sample] audio.play() 실패:", playErr);
        throw new Error("미리듣기 오디오를 재생할 수 없습니다. 잠시 후 다시 시도해주세요.");
      }
      if (mountedRef.current) setPreview("playing");
    } catch (e) {
      releaseUrl();
      if (mountedRef.current) {
        toast.error(errMessage(e, "미리듣기에 실패했습니다. (Typecast 키 확인)"));
        setPreview("idle");
      }
    }
  }

  // 감정 셀렉트 표시용 — 로딩/빈 목록/정상 상태별로 items 와 value 를 함께 맞춰
  // SelectValue 가 항상 현재 값의 라벨을 찾도록 한다(값-items 불일치 방지).
  let emotionItems: { value: string; label: string }[];
  let emotionValue: string;
  if (emotionsLoading) {
    emotionValue = emotion || "normal";
    emotionItems = [{ value: emotionValue, label: "불러오는 중…" }];
  } else if (emotions.length === 0) {
    emotionValue = "normal";
    emotionItems = [{ value: "normal", label: "기본" }];
  } else {
    emotionValue = emotion;
    emotionItems = emotions;
  }

  return (
    <div className="rounded-lg border border-muted-foreground/20 bg-muted/50 p-3 text-card-foreground">
      <div className="mb-3 flex items-center gap-2">
        <AudioLines className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">음성</span>
        <span className="text-xs text-muted-foreground">(필수)</span>
        <Button
          variant="outline"
          size="sm"
          onClick={togglePreview}
          disabled={disabled || preview === "loading" || !voiceId}
          className={cn("gap-1.5", "ml-auto")}
        >
          {preview === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : preview === "playing" ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {preview === "playing" ? "정지" : "샘플 듣기"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          items={VOICE_OPTIONS}
          value={voiceId}
          disabled={disabled}
          onValueChange={(v) => v && onPatch({ voiceId: v, emotion: "normal" })}
        >
          <SelectTrigger aria-label="성우" className="h-8 w-[136px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOICE_OPTIONS.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={emotionItems}
          value={emotionValue}
          disabled={disabled || emotionsLoading || emotions.length === 0}
          onValueChange={(v) => v && onPatch({ emotion: v })}
        >
          <SelectTrigger aria-label="감정" className="h-8 w-[112px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {emotionItems.map((emo) => (
              <SelectItem key={emo.value} value={emo.value}>
                {emo.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <span className="text-sm text-muted-foreground">속도</span>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={ttsSpeed}
            disabled={disabled}
            onValueChange={(v) => onPatch({ ttsSpeed: v })}
            className="flex-1"
          />
          <span className="w-9 text-sm tabular-nums font-medium">
            {ttsSpeed.toFixed(1)}×
          </span>
        </div>

      </div>
    </div>
  );
}
