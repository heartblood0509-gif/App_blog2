"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ThreadsContentPreview } from "./threads-content-preview";
import { useStreaming } from "@/hooks/use-streaming";
import {
  useThreadsImageGeneration,
  type GeneratedThreadsImage,
} from "@/hooks/use-threads-image-generation";
import {
  Wand2,
  Loader2,
  RotateCcw,
  ImageIcon,
  Download,
  Camera,
  Palette,
  Film,
  Square,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { addHistory } from "@/lib/threads-history";
import type { ThreadsState, ThreadsImageStyle } from "@/types";

interface StepThreadsGenerateProps {
  threads: ThreadsState;
  onChange: (partial: Partial<ThreadsState>) => void;
  onStartNew?: () => void;
}

const IMAGE_STYLES: {
  value: ThreadsImageStyle;
  label: string;
  icon: typeof Camera;
}[] = [
  { value: "realistic", label: "실사", icon: Camera },
  { value: "illustration", label: "일러스트", icon: Palette },
  { value: "film", label: "감성 필름", icon: Film },
  { value: "minimal", label: "미니멀", icon: Square },
];

const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5 (추천)" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
] as const;

export function StepThreadsGenerate({
  threads,
  onChange,
  onStartNew,
}: StepThreadsGenerateProps) {
  // 이미지 분석 모드인지 (생성 시 analysis 프롬프트 사용)
  const isImageMode =
    threads.analysisMode === "image" || threads.analysisMode === "template";

  const {
    images: generatedImages,
    isGenerating: isGeneratingImages,
    generate: generateImages,
    reset: resetImages,
  } = useThreadsImageGeneration();

  // 분석 결과에서 "## 📸 이미지 분석" 섹션만 추출 (이미지 생성 프롬프트에 활용)
  const imageAnalysisSection = useMemo(() => {
    if (!isImageMode || !threads.analysisResult) return undefined;
    const imageHeader = threads.analysisResult.indexOf("## 📸 이미지 분석");
    if (imageHeader === -1) return undefined;
    const nextHeader = threads.analysisResult.indexOf(
      "\n## ",
      imageHeader + 1
    );
    return nextHeader === -1
      ? threads.analysisResult.slice(imageHeader)
      : threads.analysisResult.slice(imageHeader, nextHeader);
  }, [isImageMode, threads.analysisResult]);

  const streamCallbacks = useMemo(
    () => ({
      onComplete: (fullText: string) => {
        toast.success("쓰레드 생성이 완료되었습니다.");
        const firstLine = fullText
          .split("\n")
          .find((l) => l.trim())
          ?.replace(/^#+\s*/, "")
          .trim();
        addHistory({
          title: firstLine || "쓰레드 게시물",
          content: fullText,
        });
        onChange({ generatedContent: fullText });
      },
      onError: (msg: string) => {
        toast.error(msg);
      },
    }),
    [onChange]
  );

  const {
    data: streamingContent,
    isStreaming: isGenerating,
    startStream,
    abortStream,
    reset: resetStream,
  } = useStreaming(streamCallbacks);

  // 화면에 표시할 본문: 스트리밍 중엔 streamingContent, 완료 후엔 부모 state
  const displayedContent = streamingContent || threads.generatedContent;

  // 컴포넌트 언마운트 시 fetch abort
  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);

  const handleGenerate = () => {
    resetImages();
    onChange({ generatedImages: [] });

    if (isImageMode) {
      startStream("/api/generate-threads", {
        mode: "analysis",
        analysis: threads.analysisResult,
        topic: threads.settings.topic.trim(),
        requirements: threads.settings.requirements.trim() || undefined,
      });
    } else {
      // crawl 모드: 원문 텍스트 사용
      startStream("/api/generate-threads", {
        mode: "article",
        text: threads.referenceText.trim(),
        requirements: threads.settings.requirements.trim() || undefined,
      });
    }
  };

  const handleReset = () => {
    resetStream();
    onChange({ generatedContent: "" });
    resetImages();
    onChange({ generatedImages: [] });
  };

  const handleGenerateImages = () => {
    if (!displayedContent) return;
    generateImages({
      threadsContent: displayedContent,
      imageAnalysis: imageAnalysisSection,
      aspectRatio: threads.imageAspectRatio,
      count: threads.imageCount,
      style: threads.imageStyle,
      customPrompt: threads.imagePrompt.trim() || undefined,
    });
  };

  // 이미지 생성 결과를 부모 state로 동기화
  useEffect(() => {
    if (generatedImages.length > 0) {
      onChange({ generatedImages });
    }
  }, [generatedImages, onChange]);

  const handleDownloadImage = (
    image: GeneratedThreadsImage,
    index: number
  ) => {
    const link = document.createElement("a");
    link.href = `data:${image.mimeType};base64,${image.data}`;
    link.download = `threads-image-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold">쓰레드 생성</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isImageMode
            ? "레퍼런스 분석 결과를 바탕으로 쓰레드 게시물을 작성합니다"
            : "뉴스 기사를 분석하여 쓰레드 게시물을 작성합니다"}
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-md border bg-muted/30 p-5 space-y-2 max-w-lg mx-auto">
        <div className="grid grid-cols-[90px_1fr] gap-1.5 text-base">
          <span className="text-muted-foreground">분석 방식</span>
          <span className="font-semibold">
            {isImageMode ? "레퍼런스 분석" : "뉴스 기사 활용"}
          </span>
          {isImageMode && threads.settings.topic && (
            <>
              <span className="text-muted-foreground">주제</span>
              <span className="font-semibold">{threads.settings.topic}</span>
            </>
          )}
          {!isImageMode && (
            <>
              <span className="text-muted-foreground">기사 길이</span>
              <span className="font-semibold">
                {threads.referenceText
                  .replace(/\s/g, "")
                  .length.toLocaleString()}
                자 (공백 제외)
              </span>
            </>
          )}
          {threads.settings.requirements && (
            <>
              <span className="text-muted-foreground">요구사항</span>
              <span className="font-semibold truncate">
                {threads.settings.requirements}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Generate controls */}
      <div className="flex items-center justify-center gap-3">
        {!displayedContent && !isGenerating && (
          <Button
            onClick={handleGenerate}
            className="gap-2 bg-purple-600 hover:bg-purple-700 text-base px-6 py-2.5"
          >
            <Wand2 className="h-5 w-5" />
            쓰레드 생성
          </Button>
        )}
        {isGenerating && (
          <>
            <Button variant="destructive" onClick={abortStream}>
              생성 중단
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isImageMode
                ? "레퍼런스를 참고하여 쓰레드를 작성하고 있습니다..."
                : "뉴스 기사를 분석하고 쓰레드를 작성하고 있습니다..."}
            </div>
          </>
        )}
        {displayedContent && !isGenerating && (
          <Button variant="outline" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            다시 생성
          </Button>
        )}
      </div>

      {/* Content preview */}
      {(displayedContent || isGenerating) && (
        <>
          <Separator />
          <ThreadsContentPreview
            content={displayedContent}
            isLoading={isGenerating}
          />
        </>
      )}

      {/* Image generation section */}
      {displayedContent && !isGenerating && (
        <>
          <Separator />
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-bold flex items-center justify-center gap-2 mb-1.5">
                <ImageIcon className="h-5 w-5" />
                이미지 생성
              </h3>
              <p className="text-sm text-muted-foreground">
                쓰레드 내용에 어울리는 이미지를 AI로 생성합니다
              </p>
            </div>

            {/* Style */}
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="space-y-2">
                <span className="text-sm font-semibold">스타일</span>
                <div className="grid grid-cols-4 gap-2">
                  {IMAGE_STYLES.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      variant={threads.imageStyle === value ? "default" : "outline"}
                      onClick={() => onChange({ imageStyle: value })}
                      disabled={isGeneratingImages}
                      className="gap-1.5 h-11 text-sm"
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Ratio + Count */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-semibold">비율</span>
                  <div className="grid grid-cols-2 gap-2">
                    {ASPECT_RATIOS.map(({ value, label }) => (
                      <Button
                        key={value}
                        variant={
                          threads.imageAspectRatio === value
                            ? "default"
                            : "outline"
                        }
                        onClick={() => onChange({ imageAspectRatio: value })}
                        disabled={isGeneratingImages}
                        className="h-10 text-sm"
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-semibold">매수</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2] as const).map((count) => (
                      <Button
                        key={count}
                        variant={
                          threads.imageCount === count ? "default" : "outline"
                        }
                        onClick={() => onChange({ imageCount: count })}
                        disabled={isGeneratingImages}
                        className="h-10 text-sm"
                      >
                        {count}장
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom prompt */}
              <div className="space-y-2">
                <span className="text-sm font-semibold">
                  이미지 설명 (선택)
                </span>
                <Textarea
                  placeholder="비워두면 AI가 쓰레드 내용에 맞는 이미지를 자동 생성합니다. 원하는 이미지가 있다면 간단히 설명해주세요."
                  value={threads.imagePrompt}
                  onChange={(e) => onChange({ imagePrompt: e.target.value })}
                  rows={2}
                  disabled={isGeneratingImages}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Generate button */}
            <div className="flex justify-center">
              {isGeneratingImages ? (
                <div className="flex items-center gap-2 text-base text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  이미지를 생성하고 있습니다... (최대 30초)
                </div>
              ) : (
                <Button
                  onClick={() => {
                    if (generatedImages.length > 0) resetImages();
                    handleGenerateImages();
                  }}
                  className="gap-2 bg-violet-600 hover:bg-violet-700 h-12 px-8 text-base"
                >
                  <ImageIcon className="h-5 w-5" />
                  {generatedImages.length > 0 ? "다시 생성" : "이미지 생성"}
                </Button>
              )}
            </div>

            {/* Image preview grid */}
            {generatedImages.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {generatedImages.map((image, index) => (
                  <div
                    key={index}
                    className="relative group rounded-lg overflow-hidden border bg-muted/30"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- AI 생성 결과는 base64 data URL이라 치수가 동적이고 최적화 대상이 아님 → next/image 부적합 */}
                    <img
                      src={`data:${image.mimeType};base64,${image.data}`}
                      alt={`생성된 이미지 ${index + 1}`}
                      className="w-full h-auto object-contain"
                    />
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 shadow-md"
                        onClick={() => handleDownloadImage(image, index)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        다운로드
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 다음 글 작성 CTA */}
      {displayedContent && !isGenerating && onStartNew && (
        <Button size="lg" className="w-full" onClick={onStartNew}>
          <Plus className="h-4 w-4" />
          새 글 만들기
        </Button>
      )}
    </div>
  );
}
