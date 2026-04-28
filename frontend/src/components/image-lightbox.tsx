"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 이미지 클릭 시 전체 화면에 원본 크기로 띄우는 경량 Lightbox */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-[95vw] max-h-[90vh] object-contain rounded"
        onClick={(e) => e.stopPropagation()}
      />
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-4 right-4 h-9 w-9 p-0"
        onClick={onClose}
        title="닫기 (ESC)"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
