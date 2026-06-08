"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  ExternalLink,
  CheckCircle2,
  FileText,
  Link,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  MessageCircle,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { BlogAccountManager } from "@/components/accounts/BlogAccountManager";
import { BlogContentRenderer } from "@/components/blog-content-renderer";
import { ThreadsContentPreview } from "@/components/steps-threads/threads-content-preview";
import { YoutubeScriptResult } from "@/components/steps-youtube/youtube-script-result";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";
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

// dev-only PoC 진단용: BlogContentRenderer 의 line-by-line 분기와 동일 규칙으로
// content 를 블록 배열로 분해. main 의 parsePasteBlocks 결과와 옆에 두고 비교해서
// 두 파서가 다르게 쪼개는 지점을 즉시 발견할 수 있게 함.
// 본문 전체를 로그에 싣지 않도록 text block 은 lineCount+first+last 만 detail 로 보고.
type FrontendBlockSummary = { type: string; detail?: string };
function computeFrontendPasteBlocks(content: string): FrontendBlockSummary[] {
  const MARKER_RE = /^\s*\[이미지:\s*(.+?)\]\s*$/;
  const QUOTE_HEAD_RE = /^(#{2,3})(\{[^}]+\})?\s+(.+)$/;
  const out: FrontendBlockSummary[] = [];
  const buf: string[] = [];
  let markerIdx = -1;
  const flushText = () => {
    if (buf.length === 0) return;
    const nonEmpty = buf.filter((s) => s.trim() !== "");
    const first = (nonEmpty[0] ?? buf[0] ?? "").slice(0, 50);
    const last = (nonEmpty[nonEmpty.length - 1] ?? buf[buf.length - 1] ?? "").slice(0, 50);
    out.push({
      type: "text",
      detail: `lineCount=${buf.length} nonEmpty=${nonEmpty.length} first=${JSON.stringify(first)} last=${JSON.stringify(last)}`,
    });
    buf.length = 0;
  };
  for (const raw of content.split("\n")) {
    const line = raw;
    const markerMatch = line.match(MARKER_RE);
    if (markerMatch) {
      flushText();
      markerIdx += 1;
      out.push({ type: "image", detail: `idx=${markerIdx} desc=${markerMatch[1].trim().slice(0, 60)}` });
      continue;
    }
    const headingMatch = line.match(QUOTE_HEAD_RE);
    if (headingMatch) {
      flushText();
      out.push({ type: "quote(heading)", detail: headingMatch[3].slice(0, 80) });
      continue;
    }
    if (line.startsWith("> ")) {
      flushText();
      out.push({ type: "quote(>)", detail: line.replace(/^>\s*/, "").slice(0, 80) });
      continue;
    }
    if (line.startsWith("#") && !line.startsWith("##")) {
      const tags = line.split(/\s+/).filter((t) => t.startsWith("#"));
      if (tags.length > 1) {
        flushText();
        out.push({ type: "hashtag", detail: tags.slice(0, 5).join(" ") });
        continue;
      }
    }
    if (line.trim() === "") {
      buf.push("");
      continue;
    }
    buf.push(line);
  }
  flushText();
  return out;
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
  const [cooldownSec, setCooldownSec] = useState(0); // 발행 1시간 쿨다운 남은 초(실시간 카운트다운)
  // §D 수동 발행 세션 — Chrome 창이 살아있는 동안 busy 유지.
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);
  // dev-only: SmartEditor native paste PoC + 분할뷰
  const [isRunningPasteProbe, setIsRunningPasteProbe] = useState(false);
  const [pasteProbeResult, setPasteProbeResult] = useState<{
    ok: boolean;
    error?: string;
    steps: Array<{ name: string; ok: boolean; detail: string; skipped?: boolean }>;
    snapshot?: unknown;
  } | null>(null);
  const [isBlogSplitOpen, setIsBlogSplitOpen] = useState(false);
  const [isTogglingBlogSplit, setIsTogglingBlogSplit] = useState(false);
  const [blogSplitUrl, setBlogSplitUrl] = useState("https://blog.naver.com");
  const [blogSplitAddress, setBlogSplitAddress] = useState("https://blog.naver.com");
  const [blogSplitNavState, setBlogSplitNavState] = useState({
    canGoBack: false,
    canGoForward: false,
  });
  const showPasteProbe = process.env.NODE_ENV === "development";

  // 자동 발행 중 + 수동 발행 Chrome 창 살아있는 동안 둘 다 busy.
  useBusy("publish:auto", isPublishing);
  useBusy(`publish:manual:${manualSessionId ?? "none"}`, manualSessionId !== null);

  // 발행 1시간 쿨다운 — 서버에서 남은 시간 조회(30초마다 재동기화) + 화면은 1초마다 줄여
  // "MM:SS 후 발행 가능" 실시간 카운트다운. 쿨다운 중엔 발행 버튼 비활성화.
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const res = await fetch("/api/publish/cooldown-status", { cache: "no-store" });
        const data = await res.json();
        if (alive) setCooldownSec(Math.max(0, Number(data.remaining_sec ?? 0)));
      } catch {
        // 조회 실패 시 보수적으로 그대로 둠(사용자 차단하지 않음).
      }
    };
    sync();
    const poll = window.setInterval(sync, 30000);
    const tick = window.setInterval(() => {
      setCooldownSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const formatCooldown = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // §H 발행 진행 상태 — 종료 모달 가드용 (busy 와 별도 Set). 같은 opId 공유.
  usePublishing("publish:auto", isPublishing);
  usePublishing(`publish:manual:${manualSessionId ?? "none"}`, manualSessionId !== null);

  // dev-only: 분할뷰 상태 동기화 + 언마운트 시 정리
  useEffect(() => {
    if (!showPasteProbe) return;
    const api = window.electronAPI?.blogSplit;
    if (!api) return;
    let mounted = true;

    api
      .isOpen()
      .then((open) => {
        if (mounted) setIsBlogSplitOpen(open);
        if (open) {
          api
            .getUrl()
            .then((url) => {
              if (!mounted || !url) return;
              setBlogSplitUrl(url);
              setBlogSplitAddress(url);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    const unsubscribeState = api.onState((open) => {
      setIsBlogSplitOpen(open);
    });
    const unsubscribeNavigation = api.onNavigation((state) => {
      setBlogSplitUrl(state.url);
      setBlogSplitAddress(state.url);
      setBlogSplitNavState({
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
      });
    });

    return () => {
      mounted = false;
      unsubscribeState();
      unsubscribeNavigation();
      api.close().catch(() => {});
    };
  }, [showPasteProbe]);

  // dev-only: 분할뷰 열려 있는 동안 body 클래스로 좌측 영역 50vw 축소
  useEffect(() => {
    if (!showPasteProbe) return;
    document.body.classList.toggle("blog-split-open", isBlogSplitOpen);
    return () => {
      document.body.classList.remove("blog-split-open");
    };
  }, [isBlogSplitOpen, showPasteProbe]);

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
        // 쿨다운에 걸렸으면 카운트다운 즉시 시작.
        if (typeof data.cooldown_remaining_sec === "number" && data.cooldown_remaining_sec > 0) {
          setCooldownSec(data.cooldown_remaining_sec);
        }
        // data.error 가 객체로 와도 [object Object] 안 뜨게 문자열만 사용.
        const msg = typeof data.error === "string" ? data.error : "발행에 실패했습니다.";
        throw new Error(msg);
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

  const handleToggleBlogSplit = async () => {
    const api = window.electronAPI?.blogSplit;
    if (!api) {
      toast.error("앱 실행 환경에서만 블로그 홈 화면을 함께 열 수 있습니다.");
      return;
    }

    setIsTogglingBlogSplit(true);
    try {
      if (isBlogSplitOpen) {
        await api.close();
        setIsBlogSplitOpen(false);
        return;
      }
      const result = await api.open("http://blog.naver.com");
      if (!result.ok) {
        throw new Error("블로그 홈 화면을 열 수 없습니다.");
      }
      const url = await api.getUrl().catch(() => "https://blog.naver.com");
      setBlogSplitUrl(url);
      setBlogSplitAddress(url);
      setIsBlogSplitOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "블로그 홈 화면을 열 수 없습니다.");
    } finally {
      setIsTogglingBlogSplit(false);
    }
  };

  const handleBlogSplitNavigate = async (
    action: "back" | "forward" | "reload" | "home" | "go",
    url?: string,
  ) => {
    const api = window.electronAPI?.blogSplit;
    if (!api) return;
    try {
      const result = await api.navigate(action, url);
      if (result.url) {
        setBlogSplitUrl(result.url);
        setBlogSplitAddress(result.url);
      }
      setBlogSplitNavState({
        canGoBack: result.canGoBack,
        canGoForward: result.canGoForward,
      });
    } catch {
      toast.error("블로그 화면 이동에 실패했습니다.");
    }
  };

  const handleBlogSplitAddressSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleBlogSplitNavigate("go", blogSplitAddress);
  };

  const handleCopyBlogSplitUrl = async () => {
    try {
      await navigator.clipboard.writeText(blogSplitUrl);
      toast.success("블로그 화면 주소를 복사했습니다.");
    } catch {
      toast.error("주소 복사에 실패했습니다.");
    }
  };

  const handlePasteProbe = async () => {
    const api = window.electronAPI?.blogSplit;
    if (!api) {
      toast.error("앱 실행 환경에서만 Paste PoC를 실행할 수 있습니다.");
      return;
    }

    setIsRunningPasteProbe(true);
    setPasteProbeResult(null);
    try {
      if (!(await api.isOpen())) {
        const result = await api.open("https://blog.naver.com/GoBlogWrite.naver");
        if (!result.ok) {
          throw new Error("블로그 글쓰기 화면을 열 수 없습니다.");
        }
        // PoC 자동 open 시 onState/onNavigation 이벤트 도착 전이라도 토글 버튼/주소바가 즉시 반응하도록 동기 갱신.
        setIsBlogSplitOpen(true);
        const openedUrl = await api
          .getUrl()
          .catch(() => "https://blog.naver.com/GoBlogWrite.naver");
        setBlogSplitUrl(openedUrl);
        setBlogSplitAddress(openedUrl);
      }

      const excludedSet = new Set(excludedSlotIds);
      const images = imageSlots
        .filter((slot) => !excludedSet.has(slot.id) && generatedImages[slot.id])
        .map((slot) => ({
          index: slot.index,
          base64: generatedImages[slot.id],
          mimeType: "image/png",
        }));

      // dev-only 진단: 좌측 렌더러와 같은 규칙의 frontend 블록 스냅샷도 함께 전달.
      // main 측이 parsePasteBlocks 결과와 옆에 두고 main.log 에 dump 해 비교한다.
      const frontendBlocks = computeFrontendPasteBlocks(content);
      const result = await api.pasteProbe({
        title,
        content,
        images,
        frontendBlocks,
      });
      setPasteProbeResult(result);
      if (result.ok) {
        toast.success("Draft Paste PoC가 모두 통과했습니다.");
      } else {
        toast.warning(result.error || "Draft Paste PoC 일부 항목이 실패했습니다.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Paste PoC 실행 실패";
      setPasteProbeResult({ ok: false, error: message, steps: [] });
      toast.error(message);
    } finally {
      setIsRunningPasteProbe(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <>
      {showPasteProbe && isBlogSplitOpen && (
        <div
          className="fixed top-0 z-50 flex h-11 items-center gap-2 border-b border-border bg-background px-3 shadow-sm"
          style={{ left: "50vw", width: "50vw" }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!blogSplitNavState.canGoBack}
            onClick={() => handleBlogSplitNavigate("back")}
            title="뒤로가기"
            aria-label="뒤로가기"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!blogSplitNavState.canGoForward}
            onClick={() => handleBlogSplitNavigate("forward")}
            title="앞으로가기"
            aria-label="앞으로가기"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => handleBlogSplitNavigate("reload")}
            title="새로고침"
            aria-label="새로고침"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-muted/30 px-2"
            onSubmit={handleBlogSplitAddressSubmit}
            title={blogSplitUrl}
          >
            <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={blogSplitAddress}
              onChange={(e) => setBlogSplitAddress(e.target.value)}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="블로그 화면 주소"
              spellCheck={false}
            />
          </form>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleCopyBlogSplitUrl}
            title="링크 복사"
            aria-label="링크 복사"
          >
            <Link className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            className="h-8 shrink-0 bg-[#03c75a] px-3 text-sm font-semibold text-white hover:bg-[#02b351]"
            onClick={() => handleBlogSplitNavigate("home")}
            title="네이버 홈"
            aria-label="네이버 홈"
          >
            N 홈
          </Button>
        </div>
      )}

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
              disabled={!content || isPublishing || !selectedAccountId || cooldownSec > 0}
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
                : cooldownSec > 0
                  ? `${formatCooldown(cooldownSec)} 후 발행 가능`
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

            {showPasteProbe && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleToggleBlogSplit}
                disabled={isTogglingBlogSplit}
                className="gap-2"
              >
                {isTogglingBlogSplit ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isBlogSplitOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
                {isBlogSplitOpen ? "분할 닫기" : "블로그 홈 보기"}
              </Button>
            )}

            {showPasteProbe && (
              <Button
                variant="outline"
                size="lg"
                onClick={handlePasteProbe}
                disabled={isRunningPasteProbe}
                className="gap-2 border-blue-500/40 hover:border-blue-500/70 hover:bg-blue-50 dark:hover:bg-blue-950/20"
              >
                {isRunningPasteProbe ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4 text-blue-500" />
                )}
                Draft Paste PoC
              </Button>
            )}
          </div>

          {showPasteProbe && pasteProbeResult && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  Draft Paste PoC 결과: {pasteProbeResult.ok ? "통과" : "확인 필요"}
                </span>
                {pasteProbeResult.error && (
                  <span className="text-destructive">{pasteProbeResult.error}</span>
                )}
              </div>
              {Array.isArray(
                (pasteProbeResult.snapshot as { componentOrder?: unknown } | undefined)
                  ?.componentOrder,
              ) && (
                <div className="mt-2 truncate text-muted-foreground">
                  order:{" "}
                  {(
                    (pasteProbeResult.snapshot as { componentOrder: string[] })
                      .componentOrder
                  ).join(" > ")}
                </div>
              )}
              <div className="mt-2 space-y-1">
                {pasteProbeResult.steps.map((step) => (
                  <div key={step.name} className="flex gap-2">
                    <span
                      className={
                        step.skipped
                          ? "text-muted-foreground"
                          : step.ok
                            ? "text-primary"
                            : "text-destructive"
                      }
                    >
                      {step.skipped ? "SKIP" : step.ok ? "OK" : "FAIL"}
                    </span>
                    <span className="font-mono">{step.name}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {step.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

            {/* 유튜브 변환 (로즈 톤) — 킬스위치 OFF면 전체 숨김 */}
            {YOUTUBE_FEATURE_ENABLED && (
              <>
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
              </>
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

      {/* 유튜브 스크립트 변환 결과 — 변환 결과 또는 진행 중일 때만 표시 (킬스위치 OFF면 숨김) */}
      {YOUTUBE_FEATURE_ENABLED && (youtubeMatches.length > 0 || isConvertingToYoutube) && (
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
    </>
  );
}
