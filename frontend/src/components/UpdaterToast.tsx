"use client";

// 자동 업데이트 좌하단 토스트.
//
// 표시 정책 (preload IPC `updater:state` 의 status 기반):
//   available    → "새 버전 X.Y.Z 가 있습니다" + [업데이트] / [나중에]
//   error        → 같은 자리에 에러 메시지 + [재시도] / [닫기]
//   blocked-busy → "작업이 끝나면 자동으로 설치됩니다." 안내 카드
//   downloading/downloaded/installing → 토스트는 표시 안 함
//                                       (별도 진행률 BrowserWindow 가 담당)
//
// macOS 분기: 코드사인 미보유라 자동 설치 불가 → [업데이트] 라벨을 "다운로드 페이지 열기"
//   로 표기. 클릭 시 main 프로세스가 GitHub Releases 페이지를 브라우저로 연다.
//
// sonner Toaster 를 추가로 마운트하지 않는 이유: sonner v2 는 전역 ToastState 를
// 단일 인스턴스로 공유하므로, 두 번째 Toaster 가 같은 toast 를 중복 렌더할 수 있다
// (frontend/node_modules/sonner/dist/index.mjs:371). 자체 fixed 카드로 단순화.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status =
  | "idle"
  | "checking"
  | "available"
  | "none"
  | "downloading"
  | "downloaded"
  | "error"
  | "blocked-busy";

interface UpdateInfo {
  version?: string;
  releaseName?: string;
  releaseNotes?: string;
}

export function UpdaterToast() {
  const [status, setStatus] = useState<Status>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isDarwin, setIsDarwin] = useState(false);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.updater) return;
    setIsDarwin(api.platform === "darwin");

    const off = api.updater.onState((e) => {
      setStatus(e.s);
      if (e.s === "available" && e.p && typeof e.p === "object") {
        setInfo(e.p as UpdateInfo);
      }
      if (e.s === "error") {
        setErrorMsg(typeof e.p === "string" ? e.p : "알 수 없는 오류가 발생했습니다.");
      }
    });
    return off;
  }, []);

  const dismiss = () => setStatus("idle");

  const startUpdate = () => {
    window.electronAPI?.updater.download().catch(() => {
      /* state 로 에러가 들어옴 */
    });
    // 토스트는 즉시 사라지고, 이후 화면은 main 프로세스(진행률 창) 가 통제.
    dismiss();
  };

  const retry = () => {
    setErrorMsg("");
    setStatus("idle");
    window.electronAPI?.updater.check().catch(() => { /* state */ });
  };

  const visible =
    status === "available" || status === "error" || status === "blocked-busy";

  const updateButtonLabel = isDarwin ? "다운로드 페이지 열기" : "업데이트";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, x: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed bottom-4 left-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]"
        >
          <div className="relative rounded-md border bg-popover text-popover-foreground shadow-lg p-4">
            <button
              type="button"
              aria-label="닫기"
              className="absolute top-2 right-2 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={dismiss}
            >
              <X className="h-4 w-4" />
            </button>

            {status === "available" && (
              <>
                <div className="font-semibold text-base pr-6">
                  {info?.version
                    ? `새 버전 ${info.version} 이(가) 있습니다`
                    : "새 버전이 있습니다"}
                </div>
                {/* 한 줄 요약: GitHub Release 제목(release.name) 우선. 없으면 본문 첫 줄 fallback. */}
                {(info?.releaseName || info?.releaseNotes) && (
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3 whitespace-pre-line">
                    {info?.releaseName ?? info?.releaseNotes}
                  </p>
                )}
                <div className="flex gap-2 justify-end mt-3">
                  <Button variant="ghost" size="sm" onClick={dismiss}>
                    나중에
                  </Button>
                  <Button size="sm" onClick={startUpdate}>
                    {updateButtonLabel}
                  </Button>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <div className="font-medium text-sm pr-6 text-destructive">
                  업데이트 오류
                </div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                  {errorMsg || "업데이트 도중 문제가 발생했습니다."}
                </p>
                <div className="flex gap-2 justify-end mt-3">
                  <Button variant="ghost" size="sm" onClick={dismiss}>
                    닫기
                  </Button>
                  <Button size="sm" onClick={retry}>
                    재시도
                  </Button>
                </div>
              </>
            )}

            {status === "blocked-busy" && (
              <>
                <div className="font-medium text-sm pr-6">
                  작업이 끝나면 자동으로 설치됩니다
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  글 발행 또는 수동 발행 Chrome 창이 열려 있어 설치를 잠시 미뤘습니다.
                </p>
                <div className="flex gap-2 justify-end mt-3">
                  <Button variant="ghost" size="sm" onClick={dismiss}>
                    알겠습니다
                  </Button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
