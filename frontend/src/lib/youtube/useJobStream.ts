"use client";

// 작업 진행 SSE 구독 훅. `GET /api/jobs/{id}/stream`(text/event-stream, data:JSON, 1초 주기).
// - completed/failed 프레임에서 EventSource 를 명시적으로 close 한다(안 하면 브라우저가 자동 재연결 → 루프).
// - 연결이 끊기면(onerror, 종료 전) `GET /api/jobs/{id}` 2초 폴백 폴링으로 전환.
// onFrame 은 ref 로 보관해 매 렌더마다 구독을 다시 만들지 않는다.

import { useEffect, useLayoutEffect, useRef } from "react";
import { ytUrl } from "./api";
import { getJob } from "./endpoints";

export interface JobFrame {
  status: string;
  progress: number; // 0.0 ~ 1.0
  current_step: string;
  video_url?: string | null;
  error?: string | null;
  task_error?: string | null;
  lines?: { text: string; motion: string }[];
  completed_images?: number[];
  completed_clips?: number[];
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed";
}

export function useJobStream(
  jobId: string | null,
  onFrame: (f: JobFrame) => void,
): void {
  const cbRef = useRef(onFrame);
  // 렌더 중 ref 를 직접 갱신하지 않고 커밋 단계에서 최신 콜백을 반영(react-hooks/refs).
  useLayoutEffect(() => {
    cbRef.current = onFrame;
  });

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let done = false;

    function stop() {
      done = true;
      if (es) {
        es.close();
        es = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function deliver(f: JobFrame) {
      cbRef.current(f);
      if (isTerminal(f.status)) stop();
    }

    function startPolling() {
      if (pollTimer || done) return;
      pollTimer = setInterval(async () => {
        try {
          const j = await getJob(id);
          deliver({
            status: j.status,
            progress: j.progress,
            current_step: j.current_step,
            video_url: j.video_url,
            error: j.error,
          });
        } catch {
          /* 폴백 폴링 실패는 무시하고 다음 주기에 재시도 */
        }
      }, 2000);
    }

    try {
      es = new EventSource(ytUrl(`/api/jobs/${id}/stream`), {
        withCredentials: true,
      });
      es.onmessage = (e) => {
        try {
          deliver(JSON.parse(e.data) as JobFrame);
        } catch {
          /* 깨진 프레임 무시 */
        }
      };
      es.onerror = () => {
        // 종료 전 끊김 → 폴링 폴백. 정상 종료면 done=true 라 폴링하지 않음.
        if (es) {
          es.close();
          es = null;
        }
        if (!done) startPolling();
      };
    } catch {
      startPolling();
    }

    return stop;
  }, [jobId]);
}
