"use client";

// 이미지 확인 화면(preview_ready). 생성된 컷들을 보여주고, 컷별로 [다시 그리기]·[내 사진 올리기]로
// 고친 뒤 "영상 만들기" 로 confirm → 렌더 시작.
//
// 동시 작업 잠금: 백엔드는 Card A 의 진행 상태를 job.status(단일 공유 필드)로 표현하므로
// 두 컷을 동시에 재생성하면 어느 워커가 먼저 끝나 'preview_ready' 로 되돌렸는지 구분할 수 없다.
// → 한 번에 한 컷만 작업하도록 잠근다(busy).
//
// 캐시버스팅: 재생성/업로드 후에도 이미지 URL(/images/{i})은 그대로라 브라우저가 옛 그림을 캐시한다.
// → 컷별 버전 토큰(?v=N)을 올려 새 그림을 강제로 다시 받는다.

import { useEffect, useRef, useState } from "react";
import { Film, ImageUp, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { freshYtState, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import {
  confirmRender,
  getJob,
  getPreview,
  regenerateImage,
  uploadImage,
  type PreviewResponse,
} from "@/lib/youtube/endpoints";

const ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 백엔드 한도와 동일(10MB)
const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

type Busy = { index: number; kind: "regen" | "upload" } | null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function ImagePreview() {
  const { state, update } = useYt();
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [bust, setBust] = useState<Record<number, number>>({});
  const mountedRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef(-1);

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

  function bump(i: number) {
    setBust((b) => ({ ...b, [i]: (b[i] ?? 0) + 1 }));
  }

  function srcFor(url: string, i: number): string {
    const v = bust[i];
    return v ? `${ytUrl(url)}?v=${v}` : ytUrl(url);
  }

  // job.status 가 재생성 중을 벗어날 때까지 폴링. 'preview_ready'(성공)/'failed'/'timeout' 반환.
  async function pollUntilReady(
    jobId: string,
  ): Promise<"ready" | "failed" | "timeout"> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      if (!mountedRef.current) return "timeout";
      let s: string;
      try {
        s = (await getJob(jobId)).status;
      } catch {
        continue; // 일시 오류는 무시하고 계속 폴링
      }
      if (!mountedRef.current) return "timeout";
      if (s === "preview_ready" || s === "awaiting_confirmation") return "ready";
      if (s === "failed") return "failed";
      // regenerating_image / generating_images / pending → 계속
    }
    return "timeout";
  }

  async function handleRegenerate(i: number) {
    if (!state.jobId || busy) return;
    setBusy({ index: i, kind: "regen" });
    try {
      await regenerateImage(state.jobId, i);
      const result = await pollUntilReady(state.jobId);
      if (!mountedRef.current) return;
      if (result === "ready") {
        bump(i);
        toast.success(`컷 ${i + 1}을(를) 다시 그렸어요.`);
      } else if (result === "failed") {
        toast.error(`컷 ${i + 1} 재생성에 실패했어요.`);
      } else {
        toast.error("재생성이 너무 오래 걸려요. 잠시 후 다시 시도하세요.");
      }
    } catch (e) {
      if (mountedRef.current) {
        toast.error(e instanceof Error ? e.message : "재생성 요청에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  function pickUpload(i: number) {
    if (busy) return;
    uploadTargetRef.current = i;
    fileRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // 같은 파일 재선택 허용
    const i = uploadTargetRef.current;
    uploadTargetRef.current = -1;
    if (!file || i < 0 || !state.jobId || busy) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("PNG, JPG, WebP 이미지만 올릴 수 있어요.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("파일은 10MB 이하만 올릴 수 있어요.");
      return;
    }

    setBusy({ index: i, kind: "upload" });
    try {
      await uploadImage(state.jobId, i, file);
      if (!mountedRef.current) return;
      bump(i);
      toast.success(`컷 ${i + 1} 이미지를 바꿨어요.`);
    } catch (err) {
      if (mountedRef.current) {
        toast.error(err instanceof Error ? err.message : "업로드에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  async function handleConfirm() {
    if (!state.jobId || confirming || busy) return;
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
  const locked = !!busy || confirming;

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">이미지 확인</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        AI가 만든 장면들이에요. 마음에 안 드는 컷은 <b>다시 그리기</b>나{" "}
        <b>내 사진 올리기</b>로 바꾼 뒤, 이대로 영상으로 조립합니다.
      </p>

      {/* 업로드용 숨김 input(컷별로 재사용) */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFileChosen}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imgs.map((url, i) => {
            const cellBusy = busy?.index === i;
            return (
              <div
                key={i}
                className="overflow-hidden rounded-lg border border-border bg-muted"
              >
                <div className="relative aspect-[9/16]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합) */}
                  <img
                    src={srcFor(url, i)}
                    alt={`컷 ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {cellBusy && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/75 text-xs font-medium text-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {busy?.kind === "regen" ? "다시 그리는 중..." : "올리는 중..."}
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 px-2 pt-1.5 text-xs text-muted-foreground">
                  {lines[i]?.text ?? ""}
                </p>
                <div className="flex gap-1 p-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="xs"
                    className="flex-1"
                    onClick={() => handleRegenerate(i)}
                    disabled={locked}
                  >
                    <RefreshCw className="size-3" /> 다시
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="flex-1"
                    onClick={() => pickUpload(i)}
                    disabled={locked}
                  >
                    <ImageUp className="size-3" /> 올리기
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => update(freshYtState())}
          disabled={locked}
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" /> 처음부터
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading || locked || imgs.length === 0}
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
