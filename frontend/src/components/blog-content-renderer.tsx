"use client";

import React, { useState } from "react";
import { ImageIcon, Plus } from "lucide-react";
import type { ImageSlot, UserPhoto } from "@/types";
import { EditableImageSlot, SLOT_DND_MIME } from "@/components/editable-image-slot";
import { ImageLightbox } from "@/components/image-lightbox";
import { computeBlocks } from "@/lib/image/marker-parser";

const MARKER_RE = /^\s*\[이미지:\s*(.+?)\]\s*$/;

/**
 * 편집 모드에서 필요한 상태 + 핸들러 묶음.
 * editable prop 으로 주입하면 본문 내 '이미지 자리' 에서 바로
 * 드래그/업로드 + AI 생성 + AI 변환 + 클릭 확대가 가능해진다.
 * prop 이 없으면 기존 읽기 전용 placeholder 로 동작 (step-publish 등과 호환).
 */
export interface EditableConfig {
  imageSlots: ImageSlot[];
  userPhotosBySlot: Record<string, UserPhoto>;
  isGeneratingBySlot: Record<string, boolean>;
  /** slotId → 사용자가 수정한 "생성할 이미지 프롬프트" 오버라이드. 없으면 slot.description */
  imageDescBySlot: Record<string, string>;
  /** slotId → 선택 비율("16:9"|"1:1"|"9:16"). 없으면 "1:1" */
  aspectBySlot: Record<string, string>;
  onUserPhotoChange: (slotId: string, photo: UserPhoto | null) => void;
  onGenerateSlotAI: (slotId: string) => void;
  onTransformSlot: (slotId: string) => void;
  /** 이미지 프롬프트(설명) 오버라이드 변경. null이면 기본값 복원 */
  onImageDescChange: (slotId: string, value: string | null) => void;
  /** 슬롯 비율 변경 */
  onAspectChange: (slotId: string, ratio: string) => void;
  /** 이미지 자리 삭제(마커 줄 제거) */
  onDeleteSlot: (slotId: string) => void;
  /** 이미지 자리 문단 단위 이동 */
  onMoveSlot: (slotId: string, dir: "up" | "down") => void;
  /** 이미지 자리를 임의의 블록 경계로 이동(드래그 재배치) */
  onMoveSlotToBoundary: (slotId: string, boundary: number) => void;
  /** 블록 경계에 빈 이미지 자리 삽입 (computeBlocks 인덱스) */
  onAddSlotAtBoundary: (boundary: number) => void;
}

/**
 * 블로그 글을 깔끔하게 렌더링하는 공용 컴포넌트
 * 마크다운 기호를 제거하고 블로그 스타일로 표시
 *
 * @param text 원본 마크다운
 * @param imagesByMarker 본문 내 등장 순서대로 매핑된 이미지 base64 (data URL prefix 제외)
 *                       제공되면 [이미지: …] 마커 자리에 실제 이미지 렌더
 * @param editable 주어지면 이미지 자리에서 직접 편집 가능 (Step 5 미리보기 전용)
 */
export function BlogContentRenderer({
  text,
  imagesByMarkerIndex,
  excludedIndices,
  editable,
}: {
  text: string;
  imagesByMarkerIndex?: Record<number, { base64: string; mimeType?: string }>;
  excludedIndices?: Set<number>;
  editable?: EditableConfig;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // 슬롯 드래그 진행 중이면 문단 사이 드롭 존을 상시 노출한다(hover 없이도 보이게).
  const [draggingSlot, setDraggingSlot] = useState(false);

  if (!text) return null;

  const lines = text.split("\n");
  const blocks = editable ? computeBlocks(text) : [];
  // 블록 뒤(lineEnd) → 삽입 boundary(블록 인덱스 + 1). 맨 위(boundary 0)는 별도 렌더.
  const boundaryAfterLine = new Map<number, number>();
  if (editable) blocks.forEach((b, bi) => boundaryAfterLine.set(b.lineEnd, bi + 1));
  let markerIdx = -1;

  const rendered = lines.map((line, i) => {
        // [이미지: ...] 마커
        const markerMatch = line.match(MARKER_RE);
        if (markerMatch) {
          markerIdx++;
          const localIdx = markerIdx;
          if (excludedIndices?.has(localIdx)) {
            return null;
          }
          const description = markerMatch[1].trim();
          const img = imagesByMarkerIndex?.[localIdx];

          // 편집 모드: 슬롯 정보 조회 후 EditableImageSlot 렌더
          if (editable) {
            const slot = editable.imageSlots.find((s) => s.index === localIdx);
            if (slot) {
              const userPhoto = editable.userPhotosBySlot[slot.id];
              const generatedBase64 = img?.base64;
              const isGenerating = !!editable.isGeneratingBySlot[slot.id];
              // 이동 가능 여부는 "몇 번째 이미지냐(마커 순서)"가 아니라 "위/아래에 다른 블록이
              // 있느냐(블록 위치)"로 판단해야 한다. 이동은 문단 단위(블록)로 일어나므로,
              // 대표컷을 문단 아래로 내려도 위에 블록이 생기면 다시 올릴 수 있어야 한다.
              const bIdx = blocks.findIndex(
                (b) => b.kind === "marker" && b.markerIndex === localIdx,
              );
              return (
                <EditableImageSlot
                  key={i}
                  slot={slot}
                  userPhoto={userPhoto}
                  generatedBase64={generatedBase64}
                  isGenerating={isGenerating}
                  canMoveUp={bIdx > 0}
                  canMoveDown={bIdx >= 0 && bIdx < blocks.length - 1}
                  imageDesc={editable.imageDescBySlot[slot.id]}
                  aspect={editable.aspectBySlot[slot.id] ?? "1:1"}
                  onUserPhotoChange={(p) =>
                    editable.onUserPhotoChange(slot.id, p)
                  }
                  onGenerateAI={() => editable.onGenerateSlotAI(slot.id)}
                  onImageDescChange={(v) => editable.onImageDescChange(slot.id, v)}
                  onAspectChange={(r) => editable.onAspectChange(slot.id, r)}
                  onDelete={() => editable.onDeleteSlot(slot.id)}
                  onMove={(dir) => editable.onMoveSlot(slot.id, dir)}
                  onOpenLightbox={setLightboxSrc}
                />
              );
            }
            // 슬롯 없으면 읽기 전용 경로로 폴백
          }

          if (img) {
            const mime = img.mimeType || "image/png";
            return (
              <div key={i} className="my-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${mime};base64,${img.base64}`}
                  alt={description}
                  className="w-full rounded-lg border border-border"
                />
              </div>
            );
          }
          // 이미지 없으면 placeholder
          return (
            <div
              key={i}
              className="my-4 flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6"
            >
              <ImageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                이미지 자리: {description}
              </span>
            </div>
          );
        }

        // ## 소제목 → 인용구 스타일 (##, ##{style} 모두 지원)
        const headingMatch = line.match(/^(#{2,3})(\{[^}]+\})?\s+(.+)$/);
        if (headingMatch) {
          // [[BR]] sentinel → 실제 \n 으로 치환 (whitespace-pre-wrap 이 시각 줄바꿈)
          const headingContent = headingMatch[3].replace(/\[\[BR\]\]/g, "\n");
          return (
            <div
              key={i}
              className="my-6 border-l-4 border-primary/60 bg-primary/5 px-4 py-3"
            >
              <p className="text-lg font-semibold leading-relaxed whitespace-pre-wrap">
                {renderInlineStyles(headingContent)}
              </p>
            </div>
          );
        }

        // > 인용구 → 하위 호환 (기존 글)
        if (line.startsWith("> ")) {
          const content = line.replace(/^>\s*/, "").replace(/\[\[BR\]\]/g, "\n");
          return (
            <div
              key={i}
              className="my-6 border-l-4 border-primary/60 bg-primary/5 px-4 py-3"
            >
              <p className="text-lg font-semibold leading-relaxed whitespace-pre-wrap">
                {renderInlineStyles(content)}
              </p>
            </div>
          );
        }

        // ## 헤딩 → 큰 소제목
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="mb-3 mt-8 text-xl font-bold first:mt-0">
              {renderInlineStyles(line.replace(/^##\s*/, ""))}
            </h2>
          );
        }

        // ### 헤딩 → 중간 소제목
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="mb-2 mt-6 text-lg font-semibold first:mt-0">
              {renderInlineStyles(line.replace(/^###\s*/, ""))}
            </h3>
          );
        }

        // 해시태그 줄 (#태그1 #태그2 ...)
        if (line.startsWith("#") && !line.startsWith("##")) {
          const tags = line.split(/\s+/).filter((t) => t.startsWith("#"));
          if (tags.length > 1) {
            return (
              <div key={i} className="mt-6 flex flex-wrap gap-2">
                {tags.map((tag, j) => (
                  <span
                    key={j}
                    className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            );
          }
        }

        // 빈 줄 → 문단 여백
        if (line.trim() === "") {
          return <div key={i} className="h-3" />;
        }

        // 일반 텍스트
        return (
          <p key={i} className="text-base leading-8">
            {renderInlineStyles(line)}
          </p>
        );
  });

  return (
    <>
    <div
      className="max-w-prose space-y-0"
      onDragStart={(e) => {
        if (e.dataTransfer.types.includes(SLOT_DND_MIME)) setDraggingSlot(true);
      }}
      onDragEnd={() => setDraggingSlot(false)}
    >
      {editable && blocks.length > 0 && (
        <AddImageAffordance
          active={draggingSlot}
          onAdd={() => editable.onAddSlotAtBoundary(0)}
          onDropSlot={(id) => editable.onMoveSlotToBoundary(id, 0)}
        />
      )}
      {rendered.map((el, i) => (
        <React.Fragment key={`row-${i}`}>
          {el}
          {editable && boundaryAfterLine.has(i) && (
            <AddImageAffordance
              active={draggingSlot}
              onAdd={() =>
                editable.onAddSlotAtBoundary(boundaryAfterLine.get(i)!)
              }
              onDropSlot={(id) =>
                editable.onMoveSlotToBoundary(id, boundaryAfterLine.get(i)!)
              }
            />
          )}
        </React.Fragment>
      ))}
    </div>
    {lightboxSrc && (
      <ImageLightbox
        src={lightboxSrc}
        alt="이미지 미리보기"
        onClose={() => setLightboxSrc(null)}
      />
    )}
    </>
  );
}

/**
 * 문단 사이 삽입 지점.
 * - 평소: hover 시 "＋ 여기에 이미지 추가" 노출(클릭 → 새 자리 추가)
 * - 슬롯 드래그 중(active): 드롭 존으로 변신(놓으면 그 자리로 이미지 이동)
 */
function AddImageAffordance({
  onAdd,
  onDropSlot,
  active,
}: {
  onAdd: () => void;
  onDropSlot: (slotId: string) => void;
  active: boolean;
}) {
  const [over, setOver] = useState(false);

  if (active) {
    return (
      <div
        className={`flex items-center transition-all ${over ? "h-9" : "h-7"}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(SLOT_DND_MIME)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(SLOT_DND_MIME);
          setOver(false);
          if (id) {
            e.preventDefault();
            onDropSlot(id);
          }
        }}
      >
        <div
          className={`flex w-full items-center gap-2 text-[11px] font-medium ${
            over ? "text-primary" : "text-primary/50"
          }`}
        >
          <span className={`h-0.5 flex-1 rounded ${over ? "bg-primary" : "bg-primary/30"}`} />
          <span className="whitespace-nowrap">
            {over ? "여기로 이동" : "여기에 놓기"}
          </span>
          <span className={`h-0.5 flex-1 rounded ${over ? "bg-primary" : "bg-primary/30"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="group/add flex h-5 items-center">
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-2 text-[11px] font-medium text-primary"
        title="여기에 이미지 자리 추가"
      >
        <span className="h-px flex-1 bg-primary/30 opacity-0 transition-opacity group-hover/add:opacity-100" />
        <span className="inline-flex items-center gap-1 whitespace-nowrap opacity-0 transition-opacity group-hover/add:opacity-100">
          <Plus className="h-3 w-3" /> 여기에 이미지 추가
        </span>
        <span className="h-px flex-1 bg-primary/30 opacity-0 transition-opacity group-hover/add:opacity-100" />
      </button>
    </div>
  );
}

/** **볼드**, *이탤릭* 등 인라인 스타일 처리 */
function renderInlineStyles(text: string): React.ReactNode {
  // **볼드** 처리
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // *이탤릭* 처리
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return (
        <em key={i}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
