"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, RefreshCw, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageSourceDialog } from "@/components/image-source-dialog";
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
 * - 채워진 이미지(업로드/AI 결과): 이미지 + 호버/드롭 오버레이로 "이미지 변경하기"(파일 교체)
 *   → 본문에서는 파일 교체만, AI 변환/생성은 하단 슬롯 카드에서 수행
 * - 생성 중: 스피너
 * - 빈 자리: 드래그앤드롭 영역 + [파일 선택] + [AI 생성]
 */
export function EditableImageSlot({
  slot,
  userPhoto,
  generatedBase64,
  isGenerating,
  onUserPhotoChange,
  onGenerateAI,
  onOpenLightbox,
}: {
  slot: ImageSlot;
  userPhoto?: UserPhoto;
  generatedBase64?: string;
  isGenerating: boolean;
  onUserPhotoChange: (photo: UserPhoto | null) => void;
  onGenerateAI: () => void;
  onOpenLightbox: (src: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isGenerating) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // 자식 요소 경계를 지날 때의 깜빡임 방지: 래퍼 밖으로 나갈 때만 해제
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  // ─── 공통: 파일 input (숨김) — 모든 상태에서 참조 가능하도록 먼저 선언
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

  // ─── 공통: 소스 선택 팝업(붙여넣기 / 파일에서 선택)
  const sourcePicker = (
    <ImageSourceDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      onUpload={() => fileInputRef.current?.click()}
      onPasteFile={handleFile}
    />
  );

  // ─── 채워진 이미지: 파일 교체 전용 (드래그&드랍 + "이미지 변경하기" 클릭)
  if (generatedBase64) {
    // 표시한 이미지가 업로드 원본과 동일하면 원본 mime, 아니면 AI 결과(png)
    const displayMime =
      userPhoto && userPhoto.base64 === generatedBase64
        ? userPhoto.mimeType
        : "image/png";
    const src = `data:${displayMime};base64,${generatedBase64}`;
    return (
      <div
        className={`group relative my-4 overflow-hidden rounded-lg border transition ${
          isDragOver ? "border-primary ring-2 ring-primary" : "border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {hiddenFileInput}
        {sourcePicker}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={slot.description}
          className="w-full cursor-zoom-in"
          onClick={() => onOpenLightbox(src)}
        />
        {/* 호버/드롭 시 떠오르는 부드러운 오버레이 */}
        <div
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/35 text-white transition-opacity ${
            isDragOver
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs font-medium">처리 중...</span>
            </>
          ) : isDragOver ? (
            <>
              <Upload className="h-6 w-6" />
              <span className="text-sm font-semibold">여기에 놓아 변경</span>
            </>
          ) : (
            <>
              <button
                type="button"
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-white/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen(true);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                이미지 변경하기
              </button>
              <span className="px-3 text-center text-[11px] text-white/85">
                드래그&드랍으로도 변경 · AI 변환은 아래에서 실행해주세요
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── 생성 중 (빈 상태에서 AI 생성 눌렀을 때)
  if (isGenerating) {
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

  // ─── 빈 자리 — 드래그앤드롭 + 업로드 + AI 생성
  return (
    <div
      className={`my-4 flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-border bg-muted/30"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {hiddenFileInput}
      {sourcePicker}
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
          onClick={() => setPickerOpen(true)}
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
