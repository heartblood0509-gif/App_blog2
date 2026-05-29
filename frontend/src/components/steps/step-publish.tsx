"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Copy,
  Download,
  ExternalLink,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { BlogAccountManager } from "@/components/accounts/BlogAccountManager";
import { BlogContentRenderer } from "@/components/blog-content-renderer";
import { ThreadsContentPreview } from "@/components/steps-threads/threads-content-preview";
import { YoutubeScriptResult } from "@/components/steps-youtube/youtube-script-result";
import { useWizardState } from "@/components/providers/WizardStateProvider";
import type { BlogAccount, ImageSlot } from "@/types";
import type { MediaMatch } from "@/lib/youtube-script/apply-matches";
import { pruneExcludedMarkers } from "@/lib/image/marker-parser";
import { useBusy, usePublishing } from "@/lib/busy";
import { useStreaming } from "@/hooks/use-streaming";

interface StepPublishProps {
  content: string;
  title: string;
  imageSlots?: ImageSlot[];
  generatedImages?: Record<string, string>;
  excludedSlotIds?: string[];
  onStartNew?: () => void;
}

export function StepPublish({
  content,
  title,
  imageSlots = [],
  generatedImages = {},
  excludedSlotIds = [],
  onStartNew,
}: StepPublishProps) {
  const { resetState } = useWizardState();
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BlogAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [autoPublish] = useState(false); // 기본: 검토 후 수동 발행
  // §D 수동 발행 세션 — Chrome 창이 살아있는 동안 busy 유지.
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);

  // 자동 발행 중 + 수동 발행 Chrome 창 살아있는 동안 둘 다 busy.
  useBusy("publish:auto", isPublishing);
  useBusy(`publish:manual:${manualSessionId ?? "none"}`, manualSessionId !== null);

  // §H 발행 진행 상태 — 종료 모달 가드용 (busy 와 별도 Set). 같은 opId 공유.
  usePublishing("publish:auto", isPublishing);
  usePublishing(`publish:manual:${manualSessionId ?? "none"}`, manualSessionId !== null);

  // ─────────────────────────────────────────────
  // 블로그 본문 → 쓰레드 변환 (1소스 멀티유즈)
  // step-generate에서 발행 단계로 이전 — "텍스트 복사·마크다운 다운로드"와
  // 같은 "내보내기" 카테고리이므로 발행 단계에서 함께 관리.
  // ─────────────────────────────────────────────
  const {
    data: threadsContent,
    isStreaming: isConvertingToThreads,
    startStream: startThreadsConvert,
    abortStream: abortThreadsConvert,
    reset: resetThreadsConvert,
  } = useStreaming({
    onComplete: () => toast.success("쓰레드 변환 완료"),
    onError: (msg: string) => toast.error(msg),
  });

  const handleConvertToThreads = () => {
    if (!content || content.trim().length < 200) {
      toast.error("본문이 너무 짧습니다 (최소 200자).");
      return;
    }
    startThreadsConvert("/api/generate-threads", {
      mode: "blog",
      blogContent: content,
    });
  };

  // ─────────────────────────────────────────────
  // 블로그 본문 → 유튜브 스크립트 변환 (D안: AI 찾기 + 코드 바꾸기)
  // AI는 매체 표현 매칭 리스트(JSON)만 반환, 코드(applyMatches)가 본문에 일괄 치환.
  // 본문 100% 보존을 구조적으로 보장한다.
  // ─────────────────────────────────────────────
  const [youtubeMatches, setYoutubeMatches] = useState<MediaMatch[]>([]);
  const [youtubeExcludedKeys, setYoutubeExcludedKeys] = useState<Set<string>>(new Set());
  const [isConvertingToYoutube, setIsConvertingToYoutube] = useState(false);

  const handleConvertToYoutube = async () => {
    if (!content || content.trim().length < 200) {
      toast.error("본문이 너무 짧습니다 (최소 200자).");
      return;
    }
    setIsConvertingToYoutube(true);
    try {
      const res = await fetch("/api/convert-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogContent: content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "변환 실패" }));
        throw new Error(data.error || "변환 실패");
      }
      const data = await res.json();
      setYoutubeMatches(Array.isArray(data.matches) ? data.matches : []);
      setYoutubeExcludedKeys(new Set());
      toast.success("유튜브 변환 완료");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변환 실패");
    } finally {
      setIsConvertingToYoutube(false);
    }
  };

  const handleToggleYoutubeMatch = (key: string) => {
    setYoutubeExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleResetYoutube = () => {
    setYoutubeMatches([]);
    setYoutubeExcludedKeys(new Set());
  };

  // 수동 발행 시 5초 폴링으로 Chrome 닫힘 감지 → manualSessionId 해제 (busy 자동 풀림).
  useEffect(() => {
    if (!manualSessionId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/publish/manual-status?id=${encodeURIComponent(manualSessionId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!cancelled && data.disconnected) {
          setManualSessionId(null);
          toast.info("수동 발행 세션이 종료되었습니다.");
          return;
        }
      } catch {
        // 폴링 실패는 무시. 다음 tick 에 재시도.
      }
      if (!cancelled) setTimeout(tick, 5000);
    };
    const timer = setTimeout(tick, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [manualSessionId]);

  // 복사
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("클립보드에 복사되었습니다");
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }, [content]);

  // 마크다운 다운로드
  const handleDownloadMarkdown = useCallback(() => {
    const filename = title
      ? `${title.replace(/[/\\?%*:|"<>]/g, "").slice(0, 50)}.md`
      : "blog-post.md";
    const markdownContent = title ? `# ${title}\n\n${content}` : content;
    const blob = new Blob([markdownContent], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("마크다운 파일이 다운로드되었습니다");
  }, [content, title]);

  // 발행
  const handlePublish = async () => {
    if (!selectedAccountId) {
      toast.error("발행할 블로그 계정을 선택해주세요.");
      return;
    }

    // 제외된 슬롯의 마커를 content에서 제거
    const excludedSet = new Set(excludedSlotIds);
    const cleanedContent = pruneExcludedMarkers(content, imageSlots, excludedSet);

    // 활성 슬롯 중 이미지가 생성된 것만 백엔드에 전달
    const images = imageSlots
      .filter((s) => !excludedSet.has(s.id) && generatedImages[s.id])
      .map((s) => ({
        slot_id: s.id,
        description: s.description,
        group_id: s.groupId,
        pair_role: s.pairRole,
        base64: generatedImages[s.id],
        mime_type: "image/png",
      }));

    const missingCount = imageSlots.filter(
      (s) => !excludedSet.has(s.id) && !generatedImages[s.id]
    ).length;

    if (missingCount > 0) {
      const ok = confirm(
        `이미지 ${missingCount}개가 아직 생성되지 않았습니다. 해당 자리는 빈 상태로 발행됩니다. 계속할까요?`
      );
      if (!ok) return;
    }

    setIsPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: cleanedContent,
          account_id: selectedAccountId,
          images,
          auto_publish: autoPublish,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "발행에 실패했습니다.");
      }
      if (data.mode === "awaiting_manual_publish") {
        // §D — Chrome 창이 살아있는 동안 busy 유지. 닫히면 폴링이 감지해 자동 해제.
        if (data.manual_session_id) {
          setManualSessionId(data.manual_session_id);
        }
        toast.info(data.message || "Chrome 창에서 직접 '발행' 버튼을 눌러주세요", {
          duration: 10000,
        });
      } else {
        toast.success(data.message || "네이버 블로그에 발행되었습니다!");
        if (data.post_url) {
          setPublishedUrl(data.post_url);
        }
      }
      if (data.warning) {
        toast.warning(data.warning);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "발행 실패";
      if (msg.includes("연결할 수 없습니다") || msg.includes("fetch")) {
        toast.error(
          "Python 백엔드 서버가 실행 중이 아닙니다. backend/ 디렉토리에서 python main.py를 실행하세요."
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">발행</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          블로그 계정을 선택하고 발행하세요
        </p>
      </div>

      {/* 발행 성공 카드 — 발행 후 다음 액션 안내 */}
      {publishedUrl && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">발행 완료</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            네이버 블로그에 게시되었습니다. 아래 버튼으로 결과를 확인하거나 새 글을 시작하세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-background px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <ExternalLink className="h-4 w-4" />
              포스트 보기
            </a>
            <Button
              size="sm"
              onClick={() => {
                setPublishedUrl(null);
                resetState();
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              새 글 만들기
            </Button>
          </div>
        </div>
      )}

      <BlogAccountManager
        mode="select"
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        onAccountsChange={setAccounts}
        className="max-w-none"
      />

      {/* 액션 영역 — 두 그룹 박스 분리:
          (A) 블로그 그대로 내보내기 = 발행 / 복사 / 마크다운 (메인 카테고리, 실선 박스)
          (B) 다른 채널로 변환      = 쓰레드 / 유튜브 (보조 카테고리, 점선 박스 + 옅은 배경)
          박스로 묶어 두 그룹의 본질(같은 글 그대로 vs 형식 변환) 차이를 시각적으로 분리. */}
      <div className="space-y-4">
        {/* 그룹 A: 블로그 발행 + 같은 본문 내보내기 */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            📤 이 글 그대로 내보내기
          </h3>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={!content || isPublishing || !selectedAccountId}
              className="gap-2 px-6 py-6 text-base font-semibold"
              onClick={handlePublish}
            >
              {isPublishing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ExternalLink className="h-5 w-5" />
              )}
              {isPublishing
                ? "글 작성 중..."
                : selectedAccount
                  ? `"${selectedAccount.label}"에 자동발행하기`
                  : "계정을 선택하세요"}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={handleCopy}
              disabled={!content}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              텍스트 복사
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={handleDownloadMarkdown}
              disabled={!content}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              마크다운 다운로드
            </Button>
          </div>
        </div>

        {/* 그룹 B: 다른 채널 변환 (보조, 선택 액션) */}
        <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            🔁 다른 채널로 변환{" "}
            <span className="font-normal text-muted-foreground">(선택)</span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {/* 쓰레드 변환 (오렌지 톤) */}
            {!threadsContent && !isConvertingToThreads && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleConvertToThreads}
                disabled={!content || content.trim().length < 200}
                className="gap-2 border-orange-500/40 hover:border-orange-500/70 hover:bg-orange-50 dark:hover:bg-orange-950/20"
              >
                <span className="text-base leading-none" aria-hidden="true">💬</span>
                쓰레드 변환
              </Button>
            )}
            {isConvertingToThreads && (
              <>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={abortThreadsConvert}
                  className="gap-2"
                >
                  중단
                </Button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  3단 구조(본문 + 댓글1 + 댓글2)로 변환 중...
                </div>
              </>
            )}
            {threadsContent && !isConvertingToThreads && (
              <Button
                variant="outline"
                size="lg"
                onClick={resetThreadsConvert}
                className="gap-2 border-orange-500/40 hover:border-orange-500/70 hover:bg-orange-50 dark:hover:bg-orange-950/20"
              >
                <RefreshCw className="h-4 w-4 text-orange-500" />
                쓰레드 다시 변환
              </Button>
            )}

            {/* 유튜브 변환 (로즈 톤) */}
            {youtubeMatches.length === 0 && !isConvertingToYoutube && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleConvertToYoutube}
                disabled={!content || content.trim().length < 200}
                className="gap-2 border-rose-500/40 hover:border-rose-500/70 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              >
                <span className="text-base leading-none" aria-hidden="true">🎬</span>
                유튜브 변환
              </Button>
            )}
            {isConvertingToYoutube && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                유튜브 변환 중...
              </div>
            )}
            {youtubeMatches.length > 0 && !isConvertingToYoutube && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleResetYoutube}
                className="gap-2 border-rose-500/40 hover:border-rose-500/70 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              >
                <RefreshCw className="h-4 w-4 text-rose-500" />
                유튜브 다시 변환
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* 쓰레드 변환 결과 — 변환 결과 또는 진행 중일 때만 표시 */}
      {(threadsContent || isConvertingToThreads) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageCircle className="h-4 w-4 text-orange-500" />
              쓰레드 변환 결과
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ThreadsContentPreview
              content={threadsContent}
              isLoading={isConvertingToThreads}
            />
          </CardContent>
        </Card>
      )}

      {/* 유튜브 스크립트 변환 결과 — 변환 결과 또는 진행 중일 때만 표시 */}
      {(youtubeMatches.length > 0 || isConvertingToYoutube) && (
        <YoutubeScriptResult
          originalContent={content}
          matches={youtubeMatches}
          excludedKeys={youtubeExcludedKeys}
          onToggleMatch={handleToggleYoutubeMatch}
          isLoading={isConvertingToYoutube}
        />
      )}

      {/* Content Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            최종 미리보기
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!content && (
            <div className="flex flex-col items-center justify-center py-20">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                생성된 글이 없습니다. 이전 단계에서 글을 생성해주세요.
              </p>
            </div>
          )}

          {content && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {title && (
                <div className="mb-6">
                  <h1 className="text-xl font-bold leading-tight">{title}</h1>
                  <Separator className="mt-4" />
                </div>
              )}

              <ScrollArea className="h-[500px] pr-4">
                <BlogContentRenderer
                  text={content}
                  imagesByMarkerIndex={Object.fromEntries(
                    imageSlots
                      .filter((s) => generatedImages[s.id])
                      .map((s) => [s.index, { base64: generatedImages[s.id] }])
                  )}
                  excludedIndices={
                    new Set(
                      imageSlots
                        .filter((s) => excludedSlotIds.includes(s.id))
                        .map((s) => s.index)
                    )
                  }
                />
              </ScrollArea>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Completion Note */}
      {content && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">글 생성이 완료되었습니다</p>
            <p className="mt-1 text-xs text-muted-foreground">
              블로그 계정을 선택하고 발행하거나, 텍스트를 복사/다운로드할 수
              있습니다.
            </p>
          </div>
        </motion.div>
      )}

      {/* 다음 글 작성 CTA */}
      {content && onStartNew && (
        <Button
          size="lg"
          className="w-full"
          onClick={onStartNew}
        >
          <Plus className="h-4 w-4" />
          새 글 만들기
        </Button>
      )}
    </div>
  );
}
