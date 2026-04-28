"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, RefreshCw, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageSlot, UserPhoto } from "@/types";

/** 파일 → base64 변환 (data URL prefix 제외) */
async function fileToBase64(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [prefix, base64] = result.split(",");
      const mime =
        prefix.match(/data:(.+);base64/)?.[1] || file.type || "image/jpeg";
      resolve({ base64, mimeType: mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 본문 미리보기 속 '이미지 자리' 를 편집 가능한 인터랙티브 슬롯으로 렌더.
 *
 * 상태별 UI:
 * - 빈 자리: 드래그앤드롭 영역 + [파일 선택] + [AI 생성]
 * - 변환 전 (원본 올렸고 아직 AI 변환 안 함): 원본 썸네일 + 변환 대기 오버레이 + [AI 변환] + [AI 생성]
 * - 이미지 완성: 완성 이미지 + cursor-zoom-in (클릭 시 onOpenLightbox)
 * - 생성 중: 스피너 + 버튼 비활성
 */
export function EditableImageSlot({
  slot,
  userPhoto,
  generatedBase64,
  isGenerating,
  onUserPhotoChange,
  onGenerateAI,
  onTransform,
  onOpenLightbox,
}: {
  slot: ImageSlot;
  userPhoto?: UserPhoto;
  generatedBase64?: string;
  isGenerating: boolean;
  onUserPhotoChange: (photo: UserPhoto | null) => void;
  onGenerateAI: () => void;
  onTransform: () => void;
  onOpenLightbox: (src: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const hasPhoto = !!userPhoto;
  const isPendingTransform =
    hasPhoto &&
    !!generatedBase64 &&
    generatedBase64 === userPhoto.base64 &&
    !isGenerating;
  const hasFinalImage =
    !!generatedBase64 && !isPendingTransform;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일을 올려주세요");
      return;
    }
    const { base64, mimeType } = await fileToBase64(file);
    onUserPhotoChange({
      base64,
      mimeType,
      instruction: userPhoto?.instruction || "",
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isGenerating) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ─── 상태 1: 이미지 완성됨 — 표시 + 클릭 확대
  if (hasFinalImage) {
    return (
      <div className="my-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${generatedBase64}`}
          alt={slot.description}
          className="w-full rounded-lg border border-border cursor-zoom-in"
          onClick={() =>
            onOpenLightbox(`data:image/png;base64,${generatedBase64}`)
          }
        />
      </div>
    );
  }

  // ─── 공통: 파일 input (숨김)
  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) await handleFile(file);
        e.target.value = "";
      }}
    />
  );

  // ─── 상태 2: 변환 전 (원본만 올렸고 AI 변환 대기)
  if (isPendingTransform && userPhoto) {
    return (
      <div className="my-4 rounded-lg border border-border bg-muted/20 p-3">
        {hiddenFileInput}
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${userPhoto.mimeType};base64,${userPhoto.base64}`}
            alt="원본 사진"
            className="w-full aspect-video rounded object-contain bg-muted/50 cursor-zoom-in"
            onClick={() =>
              onOpenLightbox(
                `data:${userPhoto.mimeType};base64,${userPhoto.base64}`
              )
            }
          />
          {/* 변환 대기 오버레이 */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded bg-black/55 backdrop-blur-[1px] text-white cursor-zoom-in"
            onClick={() =>
              onOpenLightbox(
                `data:${userPhoto.mimeType};base64,${userPhoto.base64}`
              )
            }
          >
            <RefreshCw className="h-6 w-6" />
            <span className="text-xs font-medium">AI 변환을 눌러주세요</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground line-clamp-1">
          이미지 자리: {slot.description}
        </p>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="default"
            className="flex-1 h-8 gap-1 text-xs"
            onClick={onTransform}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            AI 변환
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 gap-1 text-xs"
            onClick={onGenerateAI}
            disabled={isGenerating}
            title="원본 사진을 무시하고 AI로 새 이미지를 생성합니다"
          >
            <Sparkles className="h-3 w-3" />
            AI 생성
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => onUserPhotoChange(null)}
            disabled={isGenerating}
            title="원본 사진 제거"
          >
            제거
          </Button>
        </div>
      </div>
    );
  }

  // ─── 상태 3: 생성 중 (빈 상태에서 AI 생성 눌렀을 때)
  if (isGenerating && !hasPhoto) {
    return (
      <div className="my-4 flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            이미지 생성 중...
          </span>
        </div>
      </div>
    );
  }

  // ─── 상태 4: 빈 자리 — 드래그앤드롭 + 업로드 + AI 생성
  return (
    <div
      className={`my-4 flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-border bg-muted/30"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isGenerating) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {hiddenFileInput}
      <div className="flex items-center gap-2 text-muted-foreground">
        <ImageIcon className="h-5 w-5" />
        <span className="text-xs line-clamp-1">
          이미지 자리: {slot.description}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {isDragOver
          ? "여기에 놓으세요"
          : "이미지를 드래그하거나 아래 버튼을 누르세요"}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating}
        >
          <Upload className="h-3 w-3" />
          파일 선택
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={onGenerateAI}
          disabled={isGenerating}
        >
          <Sparkles className="h-3 w-3" />
          AI 생성
        </Button>
      </div>
    </div>
  );
}
