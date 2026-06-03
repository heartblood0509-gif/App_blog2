"use client";

// 이미지 확인 화면(preview_ready). 생성된 컷들을 보여주고 "영상 만들기" 로 confirm → 렌더 시작.
// (줄별 이미지 재생성/업로드는 후속 M2b. 여기선 확인 후 렌더 시작까지.)

import { useEffect, useRef, useState } from "react";
import { Film, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { initialYtState, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import {
  confirmRender,
  getPreview,
  type PreviewResponse,
} from "@/lib/youtube/endpoints";

export function ImagePreview() {
  const { state, update } = useYt();
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = state.jobId;
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await getPreview(id);
        if (mountedRef.current) setData(res);
      } catch (e) {
        if (mountedRef.current) {
          toast.error(
            e instanceof Error ? e.message : "미리보기를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    if (!state.jobId || confirming) return;
    setConfirming(true);
    try {
      await confirmRender(state.jobId, "kenburns");
      update({ screen: "progress" }); // 렌더 진행 감시로 복귀
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "영상 제작 시작에 실패했습니다.",
      );
      if (mountedRef.current) setConfirming(false);
    }
  }

  const imgs = data?.image_urls ?? [];
  const lines = data?.lines ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">이미지 확인</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        AI가 만든 장면들이에요. 마음에 들면 이대로 영상으로 조립합니다.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imgs.map((url, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border bg-muted"
            >
              <div className="aspect-[9/16]">
                {/* eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합) */}
                <img
                  src={ytUrl(url)}
                  alt={`컷 ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="line-clamp-2 px-2 py-1.5 text-xs text-muted-foreground">
                {lines[i]?.text ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => update({ ...initialYtState })}
          disabled={confirming}
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" /> 처음부터
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading || confirming || imgs.length === 0}
          className="gap-2"
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          {confirming ? "시작하는 중..." : "이대로 영상 만들기"}
        </Button>
      </div>
    </div>
  );
}
