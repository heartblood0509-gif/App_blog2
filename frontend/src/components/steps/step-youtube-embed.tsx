"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

// "유튜브" 탭 — youtube-backend(쇼츠 생성기)를 iframe 으로 그대로 임베드한다.
// youtube-backend 는 자기 origin(127.0.0.1:포트)에서 정적 UI + API 를 서빙하므로
// iframe 안에서 원본과 동일하게 동작한다(같은 origin → 쿠키/SSE/상대경로 정상).
export function StepYoutubeEmbed() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/youtube-url")
      .then((r) => r.json())
      .then((data: { url: string | null }) => {
        if (cancelled) return;
        if (data.url) setUrl(data.url);
        else setError("유튜브 백엔드 주소를 찾을 수 없습니다. 데스크톱 앱에서 실행해주세요.");
      })
      .catch(() => {
        if (!cancelled) setError("유튜브 백엔드에 연결할 수 없습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <iframe
      src={url}
      title="유튜브 쇼츠 생성기"
      className="h-[78vh] w-full rounded-xl border border-border bg-background"
      // 클립보드 복사 등 일부 기능 허용. allow-same-origin 으로 자기 origin 내 쿠키/스토리지 동작.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
      allow="clipboard-write; clipboard-read"
    />
  );
}
