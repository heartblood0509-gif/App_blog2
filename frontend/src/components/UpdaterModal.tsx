"use client";

// 자동 업데이트 모달.
// preload (electron/src/preload.ts) 가 노출한 window.electronAPI.updater 의
// 5개 채널(check/download/install/onState/onProgress) 만 사용.
//
// 상태 머신:
//   idle      → 표시 안 함
//   checking  → (조용히 진행, 모달 안 띄움)
//   available → "새 버전이 있습니다" 카드 + [다운로드] / [나중에]
//   none      → 표시 안 함
//   downloading → 진행률 바 + 퍼센트
//   downloaded → "설치 준비 완료" 카드 + [지금 설치] / [다음에 시작 시]
//   error     → 에러 메시지 + [닫기]
//
// "다음에 시작 시" 버튼은 모달만 닫음. autoInstallOnAppQuit = false 이므로
// 다음 부팅 시 다시 check 됨.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// Window.electronAPI 타입은 src/types/electron-api.d.ts 에서 ambient 로 선언됨.

interface UpdateInfo {
  version?: string;
  releaseName?: string;
  releaseNotes?: string;
}

export function UpdaterModal() {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.updater) return;

    const offState = api.updater.onState((e) => {
      setStatus(e.s);
      if (e.s === "available" && e.p && typeof e.p === "object") {
        setInfo(e.p as UpdateInfo);
      }
      if (e.s === "error") {
        setErrorMsg(typeof e.p === "string" ? e.p : "알 수 없는 오류");
      }
      if (e.s === "downloading") {
        setProgress(0);
      }
    });
    const offProgress = api.updater.onProgress((percent) => {
      setProgress(percent);
      setStatus((s) => (s === "downloaded" || s === "error" ? s : "downloading"));
    });
    return () => {
      offState();
      offProgress();
    };
  }, []);

  // 모달을 띄울 상태만 필터링
  const open =
    status === "available" ||
    status === "downloading" ||
    status === "downloaded" ||
    status === "error" ||
    status === "blocked-busy";

  if (!open) return null;

  const close = () => setStatus("idle");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        {status === "available" && (
          <>
            <DialogHeader>
              <DialogTitle>새 버전이 있습니다</DialogTitle>
              <DialogDescription>
                {info?.version ? `버전 ${info.version} 으로 업데이트할 수 있습니다.` : "새 버전을 받을 수 있습니다."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={close}>나중에</Button>
              <Button
                onClick={() => {
                  window.electronAPI?.updater.download().catch(() => { /* state 로 들어옴 */ });
                }}
              >
                다운로드
              </Button>
            </DialogFooter>
          </>
        )}

        {status === "downloading" && (
          <>
            <DialogHeader>
              <DialogTitle>업데이트 다운로드 중</DialogTitle>
              <DialogDescription>{progress}%</DialogDescription>
            </DialogHeader>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeOut", duration: 0.3 }}
              />
            </div>
          </>
        )}

        {status === "downloaded" && (
          <>
            <DialogHeader>
              <DialogTitle>설치 준비 완료</DialogTitle>
              <DialogDescription>
                지금 설치하면 앱이 자동으로 재시작됩니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={close}>다음에</Button>
              <Button
                onClick={() => {
                  window.electronAPI?.updater.install().catch(() => { /* ignore */ });
                }}
              >
                지금 설치
              </Button>
            </DialogFooter>
          </>
        )}

        {status === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>업데이트 오류</DialogTitle>
              <DialogDescription>{errorMsg || "업데이트 도중 문제가 발생했습니다."}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={close}>닫기</Button>
            </DialogFooter>
          </>
        )}

        {status === "blocked-busy" && (
          <>
            <DialogHeader>
              <DialogTitle>작업이 진행 중입니다</DialogTitle>
              <DialogDescription>
                글 발행 또는 수동 발행 Chrome 창이 열려 있어 설치를 잠시 미뤘습니다.
                작업이 끝나면 자동으로 설치가 다시 시작됩니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>알겠습니다</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
