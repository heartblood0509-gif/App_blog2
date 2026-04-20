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
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BlogContentRenderer } from "@/components/blog-content-renderer";
import type { BlogAccount, ImageSlot } from "@/types";
import { pruneExcludedMarkers } from "@/lib/image/marker-parser";

interface StepPublishProps {
  content: string;
  title: string;
  imageSlots?: ImageSlot[];
  generatedImages?: Record<string, string>;
  excludedSlotIds?: string[];
}

export function StepPublish({
  content,
  title,
  imageSlots = [],
  generatedImages = {},
  excludedSlotIds = [],
}: StepPublishProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [accounts, setAccounts] = useState<BlogAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newNaverId, setNewNaverId] = useState("");
  const [newNaverPw, setNewNaverPw] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false); // 기본: 검토 후 수동 발행

  // 계정 목록 가져오기
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
    } catch {
      // 백엔드 미연결 시 빈 배열
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 계정 추가
  const handleAddAccount = async () => {
    if (!newLabel || !newNaverId || !newNaverPw) {
      toast.error("모든 항목을 입력해주세요.");
      return;
    }
    setIsAdding(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel,
          naver_id: newNaverId,
          naver_pw: newNaverPw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "계정 추가 실패");
      }
      toast.success(`계정 "${data.label}"이 추가되었습니다.`);
      setShowAddModal(false);
      setNewLabel("");
      setNewNaverId("");
      setNewNaverPw("");
      await fetchAccounts();
      setSelectedAccountId(data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "계정 추가 실패");
    } finally {
      setIsAdding(false);
    }
  };

  // 계정 삭제
  const handleDeleteAccount = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (
      !confirm(
        `"${account?.label}" 계정을 삭제하시겠습니까?\n저장된 로그인 세션도 함께 삭제됩니다.`
      )
    )
      return;

    try {
      const res = await fetch(`/api/accounts?id=${accountId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "삭제 실패");
      }
      toast.success("계정이 삭제되었습니다.");
      await fetchAccounts();
      if (selectedAccountId === accountId) {
        setSelectedAccountId(accounts[0]?.id || "");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  };

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
        toast.info(data.message || "Chrome 창에서 직접 '발행' 버튼을 눌러주세요", {
          duration: 10000,
        });
      } else {
        toast.success(data.message || "네이버 블로그에 발행되었습니다!");
        if (data.post_url) {
          toast.info(`발행 URL: ${data.post_url}`);
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
        <h2 className="text-xl font-semibold">발행</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          블로그 계정을 선택하고 발행하세요
        </p>
      </div>

      {/* 계정 선택 영역 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4" />
            발행할 블로그 선택
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`relative flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all ${
                  selectedAccountId === account.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
                onClick={() => setSelectedAccountId(account.id)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{account.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.naver_id}
                  </p>
                </div>
                {selectedAccountId === account.id && (
                  <CheckCircle2 className="ml-2 h-4 w-4 text-primary" />
                )}
                <button
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                  style={{ opacity: undefined }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.opacity = "1")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.opacity = "0")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAccount(account.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* 계정 추가 버튼 */}
            <div
              className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">계정 추가</span>
            </div>
          </div>

          {accounts.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              등록된 계정이 없습니다. &quot;계정 추가&quot;를 눌러 블로그
              계정을 등록하세요.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 계정 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-semibold">
              새 블로그 계정 추가
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  별명 (구분용)
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="예: 메인 블로그"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  네이버 ID
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="네이버 아이디"
                  value={newNaverId}
                  onChange={(e) => setNewNaverId(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  비밀번호
                </label>
                <input
                  type="password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="네이버 비밀번호"
                  value={newNaverPw}
                  onChange={(e) => setNewNaverPw(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  비밀번호는 이 컴퓨터에만 저장되며, 외부로 전송되지
                  않습니다.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setNewLabel("");
                  setNewNaverId("");
                  setNewNaverPw("");
                }}
              >
                취소
              </Button>
              <Button onClick={handleAddAccount} disabled={isAdding}>
                {isAdding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                추가
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 자동/수동 발행 토글 */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer"
            checked={autoPublish}
            onChange={(e) => setAutoPublish(e.target.checked)}
          />
          <span className="text-sm font-medium">자동 발행</span>
        </label>
        <span className="text-xs text-muted-foreground pt-0.5">
          {autoPublish
            ? "⚠️ 글 작성 후 '발행' 버튼까지 자동 클릭 (검토 없이 즉시 게시됨)"
            : "📝 글 작성만 하고 Chrome을 열어둡니다. 직접 '발행' 버튼을 눌러 게시하세요 (안전)"}
        </span>
      </div>

      {/* 발행 버튼 */}
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={!content || isPublishing || !selectedAccountId}
          className="gap-2"
          onClick={handlePublish}
        >
          {isPublishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {isPublishing
            ? autoPublish
              ? "발행 중..."
              : "글 작성 중..."
            : selectedAccount
              ? autoPublish
                ? `"${selectedAccount.label}"에 자동 발행`
                : `"${selectedAccount.label}"에 글 작성 (수동 발행)`
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

      <Separator />

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
    </div>
  );
}
