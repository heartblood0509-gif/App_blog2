"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Globe, Loader2 } from "lucide-react";

interface CrawlInputProps {
  onCrawled: (title: string, content: string, platform: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function CrawlInput({ onCrawled, onError, disabled }: CrawlInputProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCrawl = async () => {
    if (!url.trim()) {
      onError("URL을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/crawl-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        onError(data.error || "크롤링에 실패했습니다.");
        return;
      }

      onCrawled(data.title, data.content, data.platform);
    } catch {
      onError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="뉴스 기사 URL을 입력하세요"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCrawl()}
            className="pl-9"
            disabled={loading || disabled}
          />
        </div>
        <Button
          onClick={handleCrawl}
          disabled={loading || disabled || !url.trim()}
          size="default"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "크롤링"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        본문 추출이 잘 안 되면 텍스트를 직접 붙여넣어 주세요.
      </p>
    </div>
  );
}
