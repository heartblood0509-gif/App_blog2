"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Copy, Check, Eye, Code } from "lucide-react";

interface ThreadsContentPreviewProps {
  content: string;
  isLoading: boolean;
}

const stripMarkdown = (text: string): string =>
  text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n");

export function ThreadsContentPreview({
  content,
  isLoading,
}: ThreadsContentPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");

  const plainText = content ? stripMarkdown(content) : "";
  const charCountWithSpaces = plainText.length;
  const charCountNoSpaces = plainText.replace(/\s/g, "").length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText.trim());
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading && !content) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        생성된 쓰레드가 여기에 표시됩니다
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("preview")}
            className="h-7 px-2 text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            미리보기
          </Button>
          <Button
            variant={viewMode === "raw" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("raw")}
            className="h-7 px-2 text-xs"
          >
            <Code className="h-3 w-3 mr-1" />
            마크다운
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {charCountNoSpaces.toLocaleString()}자 (공백 제외) /{" "}
            {charCountWithSpaces.toLocaleString()}자 (공백 포함)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[400px] rounded-md border bg-muted/30 p-5">
        {viewMode === "preview" ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="text-sm whitespace-pre-wrap font-mono">{content}</pre>
        )}
        {isLoading && (
          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
        )}
      </ScrollArea>
    </div>
  );
}
