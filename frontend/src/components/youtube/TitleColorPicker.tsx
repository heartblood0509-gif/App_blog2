"use client";

// 제목 줄 색 선택기 — 입력칸 오른쪽 스와치 버튼 + 팝오버(프리셋 10 + 저장한 색 + 직접 HEX + 저장).
// 윗줄/아랫줄이 각각 이 컴포넌트를 쓰되 "저장한 색" 팔레트는 공유한다(useSyncExternalStore).
// 저장색은 M1 에선 localStorage, M2 에서 여러 기기 동기화 대상.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TITLE_COLOR_PRESETS,
  normalizeHex,
  contrastText,
} from "@/lib/youtube/title-colors";
import {
  subscribeSavedColors,
  getSavedColorsSnapshot,
  getSavedColorsServerSnapshot,
  addSavedColor,
  removeSavedColor,
} from "@/lib/youtube/saved-colors-store";

export function TitleColorPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string; // 현재 색(#RRGGBB)
  onChange: (hex: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const savedColors = useSyncExternalStore(
    subscribeSavedColors,
    getSavedColorsSnapshot,
    getSavedColorsServerSnapshot,
  );

  // 바깥 클릭 / ESC 로 닫기.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = normalizeHex(value);
  // 저장은 "지금 반영된 색"(current) 기준 — 프리셋/직접고르기/코드입력 무엇으로 바꿨든 동일.
  const canSave = !!current && !savedColors.includes(current);

  // 색을 적용하면서 # 코드칸도 같은 값으로 동기화(프리셋·직접고르기·저장색 클릭 공용).
  // → 미리보기·# 코드칸·저장이 항상 하나의 "현재 색"을 가리킨다.
  function applyColor(hex: string) {
    const c = normalizeHex(hex);
    if (!c) return;
    onChange(c);
    setHexInput(c);
  }

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        aria-label={ariaLabel ?? "제목 색 선택"}
        // 열 때 HEX 입력을 현재 값으로 동기화(effect 없이 이벤트에서 처리).
        onClick={() => {
          if (!open) setHexInput(value);
          setOpen((v) => !v);
        }}
        className="h-9 w-9 rounded-md border border-border shadow-inner ring-offset-background transition-shadow hover:ring-2 hover:ring-primary/40"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          {/* 프리셋 */}
          <div className="grid grid-cols-5 gap-2">
            {TITLE_COLOR_PRESETS.map((c) => {
              const sel = current === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => applyColor(c)}
                  aria-label={c}
                  className={cn(
                    "relative h-8 w-8 rounded-md border",
                    sel ? "border-primary ring-2 ring-primary/50" : "border-border",
                  )}
                  style={{ backgroundColor: c }}
                >
                  {sel && (
                    <Check
                      className="absolute inset-0 m-auto h-4 w-4"
                      style={{ color: contrastText(c) }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* 직접 고르기 — OS 색상 선택기(Electron: macOS 색상 창/스포이드). 숨긴 input[type=color]
              을 커스텀 버튼으로 연다. 네이티브 창은 별도 OS 창이라 바깥클릭 감지에 안 잡혀 팝오버 유지됨. */}
          <button
            type="button"
            onClick={() => nativeRef.current?.click()}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <span
              className="h-4 w-4 rounded-full border border-border"
              style={{
                background:
                  "conic-gradient(from 0deg, red, orange, yellow, lime, cyan, blue, magenta, red)",
              }}
            />
            직접 고르기
          </button>
          <input
            ref={nativeRef}
            type="color"
            // 브라우저가 type=color 값을 소문자로 정규화하므로 소문자로 넘겨 controlled 불일치 방지.
            value={(current ?? "#FFFFFF").toLowerCase()}
            onChange={(e) => applyColor(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          {/* 저장한 색 */}
          {savedColors.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-muted-foreground">저장한 색</p>
              <div className="mt-1.5 grid grid-cols-5 gap-2">
                {savedColors.map((c) => (
                  <div key={c} className="group relative">
                    <button
                      type="button"
                      onClick={() => applyColor(c)}
                      aria-label={c}
                      className={cn(
                        "h-8 w-8 rounded-md border",
                        current === c
                          ? "border-primary ring-2 ring-primary/50"
                          : "border-border",
                      )}
                      style={{ backgroundColor: c }}
                    />
                    <button
                      type="button"
                      onClick={() => void removeSavedColor(c)}
                      aria-label="이 색 삭제"
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 직접 입력(HEX) + 저장 */}
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">#</span>
            <input
              value={hexInput.replace(/^#/, "")}
              onChange={(e) => {
                const v = e.target.value;
                setHexInput(v);
                const c = normalizeHex(v);
                if (c) onChange(c); // 유효할 때만 즉시 반영
              }}
              maxLength={7}
              placeholder="RRGGBB"
              spellCheck={false}
              className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm uppercase tabular-nums outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={!canSave}
              title="이 색 저장"
              onClick={() => current && void addSavedColor(current)}
              className="flex h-8 flex-shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> 저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
