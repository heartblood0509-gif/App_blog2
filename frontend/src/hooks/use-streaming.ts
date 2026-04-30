"use client";

import { useState, useCallback, useRef } from "react";
import { sanitizeGeneratedContent } from "@/lib/sanitize-content";

interface UseStreamingOptions {
  onComplete?: (fullText: string) => void;
  onError?: (error: string) => void;
}

export function useStreaming(options?: UseStreamingOptions) {
  const [data, setData] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setData("");
      setError(null);
      setIsStreaming(true);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const message =
            errorData?.error || `오류가 발생했습니다 (${response.status})`;
          setError(message);
          options?.onError?.(message);
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setError("스트리밍 응답을 읽을 수 없습니다.");
          setIsStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setData(fullText);
        }

        const cleanedText = sanitizeGeneratedContent(fullText);
        if (cleanedText !== fullText) {
          setData(cleanedText);
        }
        options?.onComplete?.(cleanedText);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 사용자가 중단함 — 에러 아님
        } else {
          const message =
            err instanceof Error ? err.message : "알 수 없는 오류";
          setError(message);
          options?.onError?.(message);
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [options]
  );

  const abortStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setData("");
    setError(null);
    setIsStreaming(false);
  }, []);

  return { data, isStreaming, error, startStream, abortStream, reset };
}
