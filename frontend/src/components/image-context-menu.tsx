"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

/** 메뉴 한 변과 화면 가장자리 사이 최소 여백(px) */
const EDGE_PADDING = 8;

/**
 * 이미지 우클릭 시 커서 위치에 뜨는 경량 컨텍스트 메뉴 (항목 1개: 이미지 다운로드).
 * 바깥 클릭 / 우클릭 / 스크롤 / Esc / 리사이즈에 닫힌다. 화면 밖으로 나가지 않게 위치를 보정한다.
 */
export function ImageContextMenu({
  x,
  y,
  onDownload,
  onClose,
}: {
  x: number;
  y: number;
  onDownload: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // 렌더 후 실제 크기로 viewport 안에 들어오게 보정
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxX = window.innerWidth - width - EDGE_PADDING;
    const maxY = window.innerHeight - height - EDGE_PADDING;
    setPos({
      x: Math.max(EDGE_PADDING, Math.min(x, maxX)),
      y: Math.max(EDGE_PADDING, Math.min(y, maxY)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    // 메뉴 자체 클릭으로 바로 닫히지 않도록 capture 단계가 아닌 기본 단계에서 듣되,
    // 다운로드 항목은 onClick에서 stopPropagation 처리한다.
    document.addEventListener("click", onClose);
    document.addEventListener("contextmenu", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("click", onClose);
      document.removeEventListener("contextmenu", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          onDownload();
          onClose();
        }}
      >
        <Download className="h-4 w-4" />
        이미지 다운로드
      </button>
    </div>
  );
}
