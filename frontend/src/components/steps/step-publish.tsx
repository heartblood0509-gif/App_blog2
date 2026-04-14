"use client";

import { useCallback, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { BlogContentRenderer } from "@/components/blog-content-renderer";

interface StepPublishProps {
  content: string;
  title: string;
}

export function StepPublish({ content, title }: StepPublishProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("클립보드에 복사되었습니다");
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }, [content]);

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

  // renderContent는 BlogContentRenderer 컴포넌트로 대체

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">발행</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          최종 결과물을 확인하고 발행하세요
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {/* Naver Blog Publish Button */}
        <Button
          size="lg"
          disabled={!content || isPublishing}
          className="gap-2"
          onClick={async () => {
            setIsPublishing(true);
            try {
              const res = await fetch("/api/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, content }),
              });
              const data = await res.json();
              if (!res.ok) {
                throw new Error(data.error || "발행에 실패했습니다.");
              }
              toast.success("네이버 블로그에 발행되었습니다!");
              if (data.post_url) {
                toast.info(`발행 URL: ${data.post_url}`);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "발행 실패";
              if (msg.includes("연결할 수 없습니다") || msg.includes("fetch")) {
                toast.error("Python 백엔드 서버가 실행 중이 아닙니다. backend/ 디렉토리에서 python main.py를 실행하세요.");
              } else {
                toast.error(msg);
              }
            } finally {
              setIsPublishing(false);
            }
          }}
        >
          {isPublishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {isPublishing ? "발행 중..." : "네이버 블로그 발행"}
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
              {/* Title */}
              {title && (
                <div className="mb-6">
                  <h1 className="text-xl font-bold leading-tight">{title}</h1>
                  <Separator className="mt-4" />
                </div>
              )}

              {/* Body */}
              <ScrollArea className="h-[500px] pr-4">
                <BlogContentRenderer text={content} />
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
              텍스트를 복사하거나 마크다운 파일로 다운로드할 수 있습니다.
              네이버 블로그 발행은 Python 백엔드 서버가 실행 중이어야 합니다.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
