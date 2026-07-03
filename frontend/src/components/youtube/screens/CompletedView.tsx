"use client";

// 완료 화면. 완성된 9:16 영상을 재생/다운로드하고, 새 영상 만들기로 워크플로를 초기화한다.
// 영상은 프록시 경유(/api/jobs/{id}/video, Range 지원)로 seek 가능.

import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { freshYtState, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";

export function CompletedView() {
  const { state, update } = useYt();
  // 재제작해도 영상 주소(/video)가 같아, 브라우저가 옛 영상을 캐시로 다시 보여주던 문제 방지.
  // 완료 화면이 새로 뜰 때마다(=재렌더 직후 mount) 1회용 토큰을 붙여 항상 최신 영상을 받게 한다.
  const [cacheBust] = useState(() => Date.now());
  const videoUrl = state.jobId
    ? ytUrl(`/api/jobs/${state.jobId}/video?v=${cacheBust}`)
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">영상이 완성됐어요 🎉</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        미리 보고 다운로드하세요. 마음에 안 들면 새로 만들 수 있어요.
      </p>

      {videoUrl && (
        <div className="mt-5 flex justify-center">
          <video
            controls
            src={videoUrl}
            className="max-h-[70vh] w-auto rounded-xl border border-border bg-black"
            style={{ aspectRatio: "9 / 16" }}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={videoUrl}
          download={`shorts_${state.jobId ?? "video"}.mp4`}
          className={buttonVariants({ className: "gap-2" })}
        >
          <Download className="h-4 w-4" /> 다운로드
        </a>
        <Button
          variant="outline"
          onClick={() => update(freshYtState())}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" /> 새로 만들기
        </Button>
      </div>
    </div>
  );
}
