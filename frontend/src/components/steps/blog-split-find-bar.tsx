"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BlogSplitFindBarProps {
  /** 닫기 요청 (부모가 open 상태를 내림 + stopFind + 블로그 뷰로 포커스 복귀) */
  onClose: () => void;
}

/**
 * 우측 분할 블로그(WebContentsView)에서 단어를 찾는 도킹형 막대.
 *
 * 기존 shared/find-bar.tsx 는 React DOM 을 직접 검색하지만, 여기서는 검색 대상이
 * 네이티브 뷰라 Chromium 의 findInPage(IPC)를 쓴다. 시각 어휘만 공유한다.
 *
 * - 네이티브 뷰는 React 위를 덮으므로 막대는 그 위에 못 뜬다. 대신 내비게이션 툴바
 *   바로 아래(top-11)에 도킹하고, 자신의 실제 높이를 setFindBarHeight 로 메인에
 *   알려 블로그 뷰를 그만큼 아래로 내린다(가림 방지 + 높이 상수 단일 소스).
 * - 빠른 타이핑 시 늦게 도착한 옛 검색 결과가 카운터를 덮지 않도록 requestId 로 거른다.
 * - 한글 IME 조합 중 Enter/Esc 는 음절 확정과 충돌하므로 유예한다.
 */
export function BlogSplitFindBar({ onClose }: BlogSplitFindBarProps) {
  const [query, setQuery] = useState("");
  const [counter, setCounter] = useState({ active: 0, total: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestReqId = useRef<number | null>(null);
  const composing = useRef(false);

  // 실제 검색 호출. 빈 검색어는 findInPage 가 허용하지 않으므로 하이라이트만 지운다.
  const runSearch = useCallback(
    (text: string, options: { forward?: boolean; findNext?: boolean }) => {
      const api = window.electronAPI?.blogSplit;
      if (!api) return;
      if (text.length === 0) {
        latestReqId.current = null;
        setCounter({ active: 0, total: 0 });
        api.stopFind().catch(() => {});
        return;
      }
      api
        .find(text, options)
        .then((id) => {
          latestReqId.current = id;
        })
        .catch(() => {});
    },
    [],
  );

  // 마운트 = 열림. 입력창 포커스 + 실제 막대 높이를 메인에 보고(블로그 뷰 오프셋 단일 소스).
  // 리사이즈 시에도 다시 보고하고, 언마운트(닫힘) 시 0 으로 되돌린다.
  useEffect(() => {
    const api = window.electronAPI?.blogSplit;
    inputRef.current?.focus();

    const report = () => {
      const h = rootRef.current?.offsetHeight ?? 0;
      api?.setFindBarHeight(h).catch(() => {});
    };
    report();

    let observer: ResizeObserver | null = null;
    if (rootRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(report);
      observer.observe(rootRef.current);
    }

    return () => {
      observer?.disconnect();
      api?.setFindBarHeight(0).catch(() => {});
    };
  }, []);

  // 검색 결과(stale 필터) / 페이지 이동 시 리셋 구독.
  useEffect(() => {
    const api = window.electronAPI?.blogSplit;
    if (!api) return;
    const unsubFound = api.onFound((state) => {
      if (state.requestId !== latestReqId.current) return;
      setCounter({ active: state.activeMatchOrdinal, total: state.matches });
    });
    const unsubReset = api.onFindReset(() => {
      latestReqId.current = null;
      setCounter({ active: 0, total: 0 });
    });
    return () => {
      unsubFound();
      unsubReset();
    };
  }, []);

  const goNext = () => runSearch(query, { forward: true, findNext: true });
  const goPrev = () => runSearch(query, { forward: false, findNext: true });

  return (
    <div
      ref={rootRef}
      className="fixed top-11 z-50 flex h-10 items-center justify-end gap-1 border-b border-border bg-background px-3 shadow-sm"
      style={{ left: "50vw", width: "50vw" }}
      role="search"
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          // 조합 중(한글 입력)에는 중간 자모로 검색하지 않고 compositionend 에서 처리.
          if (!composing.current) runSearch(next, { findNext: false });
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          runSearch(e.currentTarget.value, { findNext: false });
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || composing.current) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="블로그 화면에서 찾기"
        className="h-7 w-44"
        aria-label="블로그 화면에서 찾기"
        spellCheck={false}
      />
      <span className="min-w-[3.5rem] px-1 text-center text-xs tabular-nums text-muted-foreground">
        {counter.total > 0 ? `${counter.active} / ${counter.total}` : "0 / 0"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={goPrev}
        disabled={counter.total === 0}
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
        disabled={counter.total === 0}
        aria-label="다음 결과"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={onClose}
        aria-label="찾기 닫기"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
