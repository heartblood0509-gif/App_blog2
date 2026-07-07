"use client";

// 전체 미리듣기 진행바 — 줄별로 칸이 나뉘지만 채움은 "하나의 재생 위치"가 왼쪽부터
// 연속으로 흐르는 형태다(지나간 칸=꽉 참, 현재 칸=부분, 이후=빈칸). 채움은 오디오의
// 실제 재생 시각(elapsedRef, 매 프레임)을 rAF 로 직접 읽어 그리므로 음성과 정확히 동기된다
// — 각 줄 칸이 채워지는 속도 = 그 줄을 실제로 읽는 시간. (부모 리렌더 없음)

import { useEffect, useRef } from "react";

export function PlaybackProgressBar({
  durations,
  lineIds,
  elapsedRef,
  playing,
  onSeek,
}: {
  durations: number[];
  lineIds: string[];
  elapsedRef: { current: number };
  playing: boolean;
  onSeek: (index: number) => void;
}) {
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  // 각 칸의 시작 오프셋(앞선 줄 길이 합).
  const starts: number[] = [];
  let acc = 0;
  for (const d of durations) {
    starts.push(acc);
    acc += d;
  }

  useEffect(() => {
    const paint = (elapsed: number) => {
      for (let i = 0; i < durations.length; i++) {
        const d = durations[i];
        const frac = d > 0 ? Math.max(0, Math.min(1, (elapsed - starts[i]) / d)) : 0;
        const el = fillRefs.current[i];
        if (el) el.style.width = `${frac * 100}%`;
      }
    };

    if (!playing) {
      paint(0); // 정지: 즉시 비움(트랜지션 없음)
      return;
    }
    const loop = () => {
      paint(elapsedRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // starts 는 durations 로부터 매 렌더 재계산되며, durations 가 바뀌면 재생이 멈춰(playing=false)
    // 다시 그려진다. length 로 구독 갱신을 트리거한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, durations.length]);

  return (
    <div className="mt-2 flex h-2 gap-0.5">
      {durations.map((d, i) => (
        <button
          key={lineIds[i] ?? i}
          type="button"
          aria-label={`${i + 1}번 줄부터 재생`}
          onClick={() => onSeek(i)}
          style={{ flex: Math.max(0.2, d) }}
          className="relative overflow-hidden rounded-full bg-muted transition-colors hover:bg-primary/20"
        >
          <span
            ref={(el) => {
              fillRefs.current[i] = el;
            }}
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
          />
        </button>
      ))}
    </div>
  );
}
