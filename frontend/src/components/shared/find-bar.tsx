"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * 본문 영역 안에서만 단어를 찾는 경량 Find 막대.
 *
 * - 읽기모드(렌더된 본문): CSS Custom Highlight API로 하이라이트(DOM 변형 없음 → React 안전).
 * - 편집모드(<textarea>): textarea 값에서 검색 후 setSelectionRange로 선택·스크롤.
 *
 * Electron/브라우저 모두 렌더러만으로 동작한다.
 */

const HL_MATCH = "find-match";
const HL_CURRENT = "find-current";

function supportsHighlightApi(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof window !== "undefined" &&
    "Highlight" in window
  );
}

function clearHighlights() {
  if (!supportsHighlightApi()) return;
  CSS.highlights.delete(HL_MATCH);
  CSS.highlights.delete(HL_CURRENT);
}

/** 컨테이너 하위의 모든 텍스트 노드 수집 (빈 노드 제외) */
function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent && node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let n = walker.nextNode();
  while (n) {
    nodes.push(n as Text);
    n = walker.nextNode();
  }
  return nodes;
}

/** 문자열에서 검색어의 모든 시작 인덱스 (대소문자 무시) */
function findOffsets(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const offsets: number[] = [];
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = lowerHay.indexOf(lowerNeedle, from);
    if (idx === -1) break;
    offsets.push(idx);
    from = idx + lowerNeedle.length;
  }
  return offsets;
}

export function FindBar({
  containerRef,
  enabled = true,
  revision,
}: {
  /** 검색 대상 영역 */
  containerRef: React.RefObject<HTMLElement | null>;
  /** 본문이 있어 검색이 의미 있을 때만 true */
  enabled?: boolean;
  /** 본문 내용/모드가 바뀔 때 재검색을 트리거하기 위한 값 */
  revision?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState(0); // 0-based
  const inputRef = useRef<HTMLInputElement>(null);

  // 읽기모드 매치(Range) / 편집모드 매치([start,end]) 보관
  const rangesRef = useRef<Range[]>([]);
  const taMatchesRef = useRef<Array<[number, number]>>([]);

  const getTextarea = useCallback(
    () => containerRef.current?.querySelector("textarea") ?? null,
    [containerRef]
  );

  /** 현재 매치 강조 + 화면 안으로 스크롤 */
  const focusMatch = useCallback(
    (index: number) => {
      const textarea = getTextarea();
      if (textarea) {
        const m = taMatchesRef.current[index];
        if (!m) return;
        textarea.focus();
        textarea.setSelectionRange(m[0], m[1]);
        return;
      }
      if (!supportsHighlightApi()) return;
      const ranges = rangesRef.current;
      const cur = ranges[index];
      if (!cur) return;
      const others = ranges.filter((_, i) => i !== index);
      CSS.highlights.set(HL_MATCH, new Highlight(...others));
      CSS.highlights.set(HL_CURRENT, new Highlight(cur));
      const el =
        cur.startContainer.parentElement ??
        (cur.startContainer as Element | null);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [getTextarea]
  );

  /** 검색어로 매치 재계산 */
  const recompute = useCallback(() => {
    rangesRef.current = [];
    taMatchesRef.current = [];
    clearHighlights();

    const root = containerRef.current;
    if (!open || !query || !root) {
      setCount(0);
      setCurrent(0);
      return;
    }

    const textarea = getTextarea();
    if (textarea) {
      const offsets = findOffsets(textarea.value, query);
      taMatchesRef.current = offsets.map((o) => [o, o + query.length]);
      setCount(offsets.length);
      const next = offsets.length ? Math.min(current, offsets.length - 1) : 0;
      setCurrent(next);
      if (offsets.length) focusMatch(next);
      return;
    }

    if (!supportsHighlightApi()) {
      // 하이라이트 미지원: 매치 개수만이라도 셈
      let total = 0;
      for (const node of collectTextNodes(root)) {
        total += findOffsets(node.textContent ?? "", query).length;
      }
      setCount(total);
      setCurrent(0);
      return;
    }

    const ranges: Range[] = [];
    for (const node of collectTextNodes(root)) {
      const text = node.textContent ?? "";
      for (const off of findOffsets(text, query)) {
        const range = document.createRange();
        range.setStart(node, off);
        range.setEnd(node, off + query.length);
        ranges.push(range);
      }
    }
    rangesRef.current = ranges;
    setCount(ranges.length);
    const next = ranges.length ? Math.min(current, ranges.length - 1) : 0;
    setCurrent(next);
    if (ranges.length) {
      focusMatch(next);
    } else {
      clearHighlights();
    }
    // current는 의도적으로 deps에서 제외 (검색어 변경 시 초기 위치 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, containerRef, getTextarea, focusMatch]);

  // 검색어/열림/내용 변경 시 재계산
  useEffect(() => {
    recompute();
  }, [recompute, revision]);

  // 닫히거나 언마운트되면 하이라이트 제거
  useEffect(() => {
    if (!open) clearHighlights();
    return () => clearHighlights();
  }, [open]);

  // Cmd/Ctrl+F → 열기 + 포커스
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setOpen(true);
        // 다음 틱에 포커스 (막대가 막 렌더된 경우 대비)
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCount(0);
    setCurrent(0);
    clearHighlights();
  }, []);

  const goNext = useCallback(() => {
    if (count === 0) return;
    const next = (current + 1) % count;
    setCurrent(next);
    focusMatch(next);
  }, [count, current, focusMatch]);

  const goPrev = useCallback(() => {
    if (count === 0) return;
    const next = (current - 1 + count) % count;
    setCurrent(next);
    focusMatch(next);
  }, [count, current, focusMatch]);

  if (!enabled || !open) return null;

  return (
    <div
      className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 px-2 py-1.5 shadow-md backdrop-blur"
      role="search"
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        placeholder="본문에서 찾기"
        className="h-7 w-40"
        aria-label="본문에서 찾기"
      />
      <span className="min-w-[3.5rem] px-1 text-center text-xs tabular-nums text-muted-foreground">
        {query ? `${count ? current + 1 : 0} / ${count}` : "0 / 0"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={goPrev}
        disabled={count === 0}
        aria-label="이전 결과"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={goNext}
        disabled={count === 0}
        aria-label="다음 결과"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={close}
        aria-label="찾기 닫기"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
