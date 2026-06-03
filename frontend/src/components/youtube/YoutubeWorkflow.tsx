"use client";

// 유튜브(쇼츠 픽) 탭의 네이티브 React 워크플로 루트.
// M0: 프록시 인프라 + 셸 단계 — 내부 화면 상태머신(모드선택→Card A/B→진행→미리보기→완료)은
// 이후 마일스톤에서 채워진다. 지금은 프록시 연결을 검증하고 자리표시 UI 를 보여준다.
//
// 개발용 임시 토글: localStorage 'yt_legacy_iframe' === '1' 이면 검증된 기존 iframe 을 표시.
// (재작성 진행 중에도 동작하는 경로를 확보. M5 에서 제거.)

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { ytFetch } from "@/lib/youtube/api";
import { StepYoutubeEmbed } from "@/components/steps/step-youtube-embed";

// localStorage(외부 저장소) 1회성 읽기 — useSyncExternalStore 로 SSR 안전하게(서버 스냅샷=false).
const noopSubscribe = () => () => {};
function readLegacyFlag(): boolean {
  try {
    return window.localStorage.getItem("yt_legacy_iframe") === "1";
  } catch {
    return false;
  }
}
function useLegacyIframe(): boolean {
  return useSyncExternalStore(noopSubscribe, readLegacyFlag, () => false);
}

type Probe =
  | { state: "loading" }
  | { state: "ok" }
  | { state: "error"; msg: string };

export function YoutubeWorkflow() {
  const legacy = useLegacyIframe();
  const [probe, setProbe] = useState<Probe>({ state: "loading" });

  useEffect(() => {
    if (legacy) return;
    let cancelled = false;
    ytFetch("/health")
      .then((r) => {
        if (cancelled) return;
        setProbe(
          r.ok
            ? { state: "ok" }
            : { state: "error", msg: `프록시 응답 ${r.status}` },
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "연결 실패";
        setProbe({ state: "error", msg });
      });
    return () => {
      cancelled = true;
    };
  }, [legacy]);

  // 개발용: 기존 검증본(iframe) 으로 폴백.
  if (legacy) return <StepYoutubeEmbed />;

  return (
    <div className="rounded-xl border border-border bg-card p-8 text-card-foreground">
      <h2 className="text-lg font-semibold">쇼츠 생성기 (네이티브 이식 진행 중)</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        유튜브 탭을 블로그앱과 같은 화면으로 다시 만드는 중입니다. 현재 단계: 프록시 인프라(M0).
      </p>

      <div className="mt-6 flex items-center gap-2 text-sm">
        {probe.state === "loading" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">유튜브 백엔드 연결 확인 중…</span>
          </>
        )}
        {probe.state === "ok" && (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">
              프록시 연결 정상 — <code>/api/youtube/health</code> 응답 확인됨.
            </span>
          </>
        )}
        {probe.state === "error" && (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">
              프록시 연결 확인 실패: {probe.msg}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
