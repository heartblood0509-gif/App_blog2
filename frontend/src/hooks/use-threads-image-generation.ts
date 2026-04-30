"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

export interface GeneratedThreadsImage {
  data: string;
  mimeType: string;
}

interface UseThreadsImageGenerationReturn {
  images: GeneratedThreadsImage[];
  isGenerating: boolean;
  error: string | null;
  generate: (body: Record<string, unknown>) => Promise<void>;
  reset: () => void;
}

export function useThreadsImageGeneration(): UseThreadsImageGenerationReturn {
  const [images, setImages] = useState<GeneratedThreadsImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (body: Record<string, unknown>) => {
    setIsGenerating(true);
    setError(null);
    setImages([]);

    try {
      const response = await fetch("/api/generate-threads-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || "이미지 생성에 실패했습니다.";
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      if (data.images && data.images.length > 0) {
        setImages(data.images);
        toast.success(`이미지 ${data.images.length}장이 생성되었습니다.`);
      } else {
        const msg = "이미지가 생성되지 않았습니다. 다시 시도해주세요.";
        setError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = "이미지 생성 중 오류가 발생했습니다.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setImages([]);
    setError(null);
    setIsGenerating(false);
  }, []);

  return { images, isGenerating, error, generate, reset };
}
