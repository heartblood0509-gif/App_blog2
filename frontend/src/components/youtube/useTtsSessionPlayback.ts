"use client";

// 화면·소리 단계의 음성 재생 컨트롤러.
//  · playLine: 한 줄 음성 재생(줄 ▶).
//  · playAll: 모든 줄 음성을 순서대로 + BGM 을 아래에 믹스(전체 미리듣기). 재생 줄이 바뀔 때 onLineChange.
// 재생 중인 줄 안에서 지금 보여줄 자막 조각 인덱스(nowChunkIndex)를 rAF 로 계산해 노출한다
// (조각이 바뀔 때만 setState → 리렌더 최소화). 조각 경계는 표시 길이 비례 = 백엔드 렌더와 동일 규칙.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ttsSessionLineUrl } from "@/lib/youtube/endpoints";
import {
  chunkBoundariesFromWordTimes,
  displayLen,
  type WordTime,
} from "@/lib/youtube/subtitle-split";

export interface PlaybackLine {
  lineId: string;
  index: number; // 빌드 순서(sent_XX)
  chunks: string[]; // 이 줄의 자막 조각(미리보기와 동일)
  durationSec: number; // 이 줄 음성 길이
  wordTimes?: WordTime[] | null; // 어절 타임스탬프(있으면 조각 전환을 실제 발화에 맞춤)
}

export interface PlaybackBgm {
  url: string; // 프록시 경유 재생 URL(bgmAudioUrl)
  volume01: number; // 0~0.5
  startSec: number;
}

type Mode = "idle" | "line" | "all";

// 조각 경계 시각(초, 줄 시작 기준). displayLen 가중 비례로 duration 배분.
function chunkBoundaries(chunks: string[], durationSec: number): number[] {
  const weights = chunks.map((c) => Math.max(1, displayLen(c)));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const bounds: number[] = [];
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    bounds.push((cum / total) * durationSec);
  }
  return bounds; // 길이 = chunks.length, 마지막 ≈ durationSec
}

export function useTtsSessionPlayback() {
  const [nowPlayingLineId, setNowPlayingLineId] = useState<string | null>(null);
  const [nowChunkIndex, setNowChunkIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("idle");
  // 전체 재생 기준 경과 시간(초). 플레이어의 0:03 / 0:53 표시용. 초 단위가 바뀔 때만 갱신.
  const [elapsedSec, setElapsedSec] = useState(0);

  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const boundsRef = useRef<number[]>([]);
  const chunkIdxRef = useRef(0);
  // 현재 줄이 시작하는 전체 오프셋(전체 재생 시 앞선 줄들의 길이 합). 경과시간 = base + 현재줄 currentTime.
  const baseOffsetRef = useRef(0);
  const elapsedIntRef = useRef(-1);
  // 전체 재생 경과(초, float) — 매 프레임 갱신되는 실시간 값(리렌더 없음).
  // 진행바가 오디오와 정확히 동기돼 채워지도록 rAF 소비자에게 노출한다.
  const elapsedRef = useRef(0);
  const mountedRef = useRef(true);

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cancelRaf();
    const v = voiceRef.current;
    if (v) {
      v.onended = null;
      v.pause();
      v.src = "";
      voiceRef.current = null;
    }
    const b = bgmRef.current;
    if (b) {
      b.pause();
      b.src = "";
      bgmRef.current = null;
    }
    boundsRef.current = [];
    chunkIdxRef.current = 0;
    baseOffsetRef.current = 0;
    elapsedIntRef.current = -1;
    elapsedRef.current = 0;
    if (mountedRef.current) {
      setMode("idle");
      setNowPlayingLineId(null);
      setNowChunkIndex(0);
      setElapsedSec(0);
    }
  }, [cancelRaf]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // 언마운트 정리(내부 stop 은 state 를 안 건드리게 mountedRef 로 가드됨)
      cancelRaf();
      voiceRef.current?.pause();
      voiceRef.current = null;
      bgmRef.current?.pause();
      bgmRef.current = null;
    };
  }, [cancelRaf]);

  // 현재 줄 안에서 자막 조각 인덱스를 rAF 로 추적(조각이 바뀔 때만 setState → 리렌더 최소화).
  const startTracking = useCallback(() => {
    function step() {
      const v = voiceRef.current;
      if (v) {
        const t = v.currentTime;
        const el = baseOffsetRef.current + t;
        elapsedRef.current = el; // 실시간(매 프레임) — 진행바 동기용
        // 경과 시간 텍스트(0:12/0:53)는 초 단위가 바뀔 때만 setState → ~1fps 리렌더.
        const eInt = Math.floor(el);
        if (eInt !== elapsedIntRef.current) {
          elapsedIntRef.current = eInt;
          if (mountedRef.current) setElapsedSec(el);
        }
        // 자막 조각 인덱스(조각이 바뀔 때만 setState).
        const bounds = boundsRef.current;
        if (bounds.length > 1) {
          let idx = bounds.findIndex((b) => t < b);
          if (idx < 0) idx = bounds.length - 1;
          if (idx !== chunkIdxRef.current) {
            chunkIdxRef.current = idx;
            if (mountedRef.current) setNowChunkIndex(idx);
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const beginLine = useCallback(
    (
      line: PlaybackLine,
      sessionId: string,
      version: number,
      onEnded: () => void,
      baseOffset = 0,
    ) => {
      cancelRaf();
      chunkIdxRef.current = 0;
      // 어절 타임스탬프가 정합하면 그 경계를, 아니면 표시 길이 비례 경계를 쓴다.
      boundsRef.current =
        chunkBoundariesFromWordTimes(line.chunks, line.wordTimes, line.durationSec || 0) ??
        chunkBoundaries(line.chunks, line.durationSec || 0);
      baseOffsetRef.current = baseOffset;
      elapsedIntRef.current = Math.floor(baseOffset);
      elapsedRef.current = baseOffset;
      if (mountedRef.current) {
        setNowPlayingLineId(line.lineId);
        setNowChunkIndex(0);
        setElapsedSec(baseOffset);
      }
      const audio = new Audio(ttsSessionLineUrl(sessionId, line.index, version));
      voiceRef.current = audio;
      audio.onended = onEnded;
      audio
        .play()
        .then(() => {
          startTracking();
        })
        .catch((e) => {
          console.error("[tts playback] play() 실패:", e);
          toast.error("음성을 재생할 수 없어요. 잠시 후 다시 시도해주세요.");
          stop();
        });
    },
    [cancelRaf, startTracking, stop],
  );

  const playLine = useCallback(
    async (args: {
      sessionId: string;
      version: number;
      line: PlaybackLine;
    }): Promise<void> => {
      stop();
      if (mountedRef.current) setMode("line");
      beginLine(args.line, args.sessionId, args.version, () => stop());
    },
    [stop, beginLine],
  );

  const playAll = useCallback(
    async (args: {
      sessionId: string;
      version: number;
      items: PlaybackLine[];
      bgm: PlaybackBgm | null;
      startIndex?: number;
      onLineChange?: (lineId: string) => void;
    }): Promise<void> => {
      stop();
      const { sessionId, version, items, bgm, onLineChange } = args;
      const startIndex = Math.max(0, Math.min(args.startIndex ?? 0, items.length - 1));
      if (!items.length) return;
      if (mountedRef.current) setMode("all");

      if (bgm && bgm.url) {
        const b = new Audio(bgm.url);
        b.loop = true;
        b.volume = Math.max(0, Math.min(1, bgm.volume01));
        try {
          b.currentTime = Math.max(0, bgm.startSec || 0);
        } catch {
          /* 시작 지점 설정 실패는 무시(브라우저가 clamp) */
        }
        bgmRef.current = b;
        b.play().catch((e) => console.error("[bgm] play() 실패:", e));
      }

      // 각 줄의 전체-오프셋(앞선 줄 길이 합) — 경과시간 표시용.
      const offsets: number[] = [];
      let acc = 0;
      for (const it of items) {
        offsets.push(acc);
        acc += it.durationSec || 0;
      }

      const playAt = (i: number) => {
        if (!mountedRef.current || i >= items.length) {
          stop();
          return;
        }
        const line = items[i];
        onLineChange?.(line.lineId);
        beginLine(line, sessionId, version, () => playAt(i + 1), offsets[i]);
      };
      playAt(startIndex);
    },
    [stop, beginLine],
  );

  return {
    nowPlayingLineId,
    nowChunkIndex,
    elapsedSec,
    elapsedRef,
    mode,
    playLine,
    playAll,
    stop,
  };
}
