"use client";

import { useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Sparkles,
  RefreshCw,
  ImageIcon,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageSourceDialog } from "@/components/image-source-dialog";
import { AspectToggle, aspectToClass } from "@/components/image-aspect-toggle";
import type { ImageSlot, UserPhoto } from "@/types";

/** 슬롯 드래그(재배치)용 dataTransfer MIME. 파일 드롭(교체)과 구분하는 키. */
export const SLOT_DND_MIME = "application/x-blogpick-slot";

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
  canMoveUp,
  canMoveDown,
  imageDesc,
  aspect,
  onUserPhotoChange,
  onGenerateAI,
  onImageDescChange,
  onAspectChange,
  onDelete,
  onMove,
  onOpenLightbox,
}: {
  slot: ImageSlot;
  userPhoto?: UserPhoto;
  generatedBase64?: string;
  isGenerating: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  imageDesc: string | undefined;
  aspect: string;
  onUserPhotoChange: (photo: UserPhoto | null) => void;
  onGenerateAI: () => void;
  onImageDescChange: (value: string | null) => void;
  onAspectChange: (ratio: string) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  onOpenLightbox: (src: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // 사진(업로드/변환) 자리인지는 반드시 userPhoto 유무로 판별.
  // (변환된 사진은 generatedBase64 ≠ userPhoto.base64 라 동일성 비교로는 AI 슬롯으로 오인됨)
  const hasPhoto = !!userPhoto;
  // 표시·생성에 쓰는 최종 프롬프트(공백이면 AI 추천으로 폴백)
  const effectiveDescription = imageDesc?.trim() || slot.description;
  // 편집 트리거: 사진 자리·생성 중엔 미노출
  const onEditPrompt =
    !hasPhoto && !isGenerating ? () => setEditOpen(true) : undefined;

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

  // 슬롯 재배치 드래그는 파일 드롭 로직을 타지 않도록 무시(문단 사이 드롭 존에서만 처리).
  const isSlotDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(SLOT_DND_MIME);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (isSlotDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isGenerating) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (isSlotDrag(e)) return;
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

  // ─── 공통: 프롬프트·비율 편집 다이얼로그 (사진 없는 자리에서만 트리거됨)
  // 슬롯 패널과 같은 imageDescBySlot/aspectBySlot 상태를 공유 → 한쪽 수정이 양쪽 반영.
  const editDialog = (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이미지 프롬프트·비율 수정</DialogTitle>
          <DialogDescription>
            실사·한국인 등 품질 규칙은 자동으로 적용됩니다. 무엇을 그릴지만
            적으면 됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              AI 추천 이미지 프롬프트 (수정 가능)
            </p>
            <Textarea
              value={imageDesc ?? slot.description}
              onChange={(e) => onImageDescChange(e.target.value)}
              rows={3}
              className="text-[13px] leading-relaxed resize-y"
              placeholder="이 이미지에 무엇을 그릴지 한 줄로 적으세요"
            />
            <button
              type="button"
              className="text-[11px] text-primary underline-offset-2 hover:underline disabled:opacity-40"
              onClick={() => onImageDescChange(null)}
              disabled={typeof imageDesc !== "string"}
            >
              기본값으로 복원
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">비율</span>
            <AspectToggle value={aspect} onChange={onAspectChange} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOpen(false)}>
            닫기
          </Button>
          <Button
            className="gap-2"
            onClick={() => {
              setEditOpen(false);
              onGenerateAI();
            }}
          >
            <Sparkles className="h-4 w-4" />
            {generatedBase64 ? "다시 생성" : "AI 생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <>
      {editDialog}
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
        <SlotControls
          slotId={slot.id}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={onMove}
          onDelete={onDelete}
          onEditPrompt={onEditPrompt}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={effectiveDescription}
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
      </>
    );
  }

  // ─── 생성 중 (빈 상태에서 AI 생성 눌렀을 때)
  if (isGenerating) {
    return (
      <div className="relative my-4 flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <SlotControls
          slotId={slot.id}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={onMove}
          onDelete={onDelete}
        />
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
    <>
    {editDialog}
    <div
      className={`relative my-4 flex ${aspectToClass(
        aspect
      )} flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
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
      <SlotControls
        slotId={slot.id}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMove={onMove}
        onDelete={onDelete}
        onEditPrompt={onEditPrompt}
      />
      <div className="flex items-center gap-2 text-muted-foreground">
        <ImageIcon className="h-5 w-5" />
        <span className="text-xs line-clamp-1">
          이미지 자리: {effectiveDescription}
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
    </>
  );
}

/**
 * 이미지 자리 우상단에 뜨는 컨트롤(프롬프트·비율 수정 · 위/아래 이동 · 드래그 · 삭제).
 * 모든 상태(채워짐/생성중/빈자리)의 relative 컨테이너 안에 절대배치로 얹는다.
 */
function SlotControls({
  slotId,
  canMoveUp,
  canMoveDown,
  onEditPrompt,
  onMove,
  onDelete,
}: {
  slotId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** 있으면 "프롬프트·비율 수정" 버튼 표시(사진 없는 자리에서만 전달됨) */
  onEditPrompt?: () => void;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
}) {
  const btn =
    "inline-flex h-6 w-6 items-center justify-center rounded text-foreground/80 transition hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-md bg-background/85 p-0.5 shadow-sm ring-1 ring-border backdrop-blur">
      {onEditPrompt && (
        <button
          type="button"
          className={btn}
          title="이미지 프롬프트·비율 수정"
          onClick={(e) => {
            stop(e);
            onEditPrompt();
          }}
        >
          <Wrench className="h-4 w-4" />
        </button>
      )}
      <span
        className={`${btn} cursor-grab active:cursor-grabbing`}
        title="드래그해서 원하는 위치로 이동"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SLOT_DND_MIME, slotId);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <button
        type="button"
        className={btn}
        title="위로 이동"
        disabled={!canMoveUp}
        onClick={(e) => {
          stop(e);
          if (canMoveUp) onMove("up");
        }}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn}
        title="아래로 이동"
        disabled={!canMoveDown}
        onClick={(e) => {
          stop(e);
          if (canMoveDown) onMove("down");
        }}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${btn} hover:bg-destructive/10 hover:text-destructive`}
        title="이미지 자리 삭제"
        onClick={(e) => {
          stop(e);
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
