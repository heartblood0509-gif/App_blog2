"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalysisDisplayProps {
  content: string;
  isLoading: boolean;
}

export function AnalysisDisplay({ content, isLoading }: AnalysisDisplayProps) {
  if (isLoading && !content) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (!content) return null;

  return (
    <ScrollArea className="h-[300px] rounded-md border bg-muted/30 p-4">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {isLoading && (
        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
      )}
    </ScrollArea>
  );
}
