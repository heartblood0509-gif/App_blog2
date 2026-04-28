"use client";

import React, { useState } from "react";
import { ImageIcon } from "lucide-react";
import type { ImageSlot, UserPhoto } from "@/types";
import { EditableImageSlot } from "@/components/editable-image-slot";
import { ImageLightbox } from "@/components/image-lightbox";

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
  onUserPhotoChange: (slotId: string, photo: UserPhoto | null) => void;
  onGenerateSlotAI: (slotId: string) => void;
  onTransformSlot: (slotId: string) => void;
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

  if (!text) return null;

  const lines = text.split("\n");
  let markerIdx = -1;

  return (
    <>
    <div className="max-w-prose space-y-0">
      {lines.map((line, i) => {
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
              return (
                <EditableImageSlot
                  key={i}
                  slot={slot}
                  userPhoto={userPhoto}
                  generatedBase64={generatedBase64}
                  isGenerating={isGenerating}
                  onUserPhotoChange={(p) =>
                    editable.onUserPhotoChange(slot.id, p)
                  }
                  onGenerateAI={() => editable.onGenerateSlotAI(slot.id)}
                  onTransform={() => editable.onTransformSlot(slot.id)}
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
          const headingContent = headingMatch[3];
          return (
            <div
              key={i}
              className="my-6 border-l-4 border-primary/60 bg-primary/5 px-4 py-3"
            >
              <p className="text-lg font-semibold leading-relaxed">
                {renderInlineStyles(headingContent)}
              </p>
            </div>
          );
        }

        // > 인용구 → 하위 호환 (기존 글)
        if (line.startsWith("> ")) {
          const content = line.replace(/^>\s*/, "");
          return (
            <div
              key={i}
              className="my-6 border-l-4 border-primary/60 bg-primary/5 px-4 py-3"
            >
              <p className="text-lg font-semibold leading-relaxed">
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
      })}
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
