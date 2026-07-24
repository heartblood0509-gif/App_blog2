import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadShowGuides, saveShowGuides } from "./guide-prefs";

// vitest 환경이 node 라 window/localStorage 가 없다 → SSR 가드를 통과시키려면 직접 심는다.
// (패턴: voice-defaults.test.ts)
const store = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };

beforeEach(() => {
  g.window = {};
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  store.clear();
});

afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe("guide-prefs — 안전 영역 표시 기억(첫 방문 켜짐)", () => {
  it("첫 방문(미저장)은 켜짐", () => {
    expect(loadShowGuides()).toBe(true);
  });

  it("끈 선택을 기억한다", () => {
    saveShowGuides(false);
    expect(loadShowGuides()).toBe(false);
  });

  it("다시 켠 선택도 기억한다", () => {
    saveShowGuides(false);
    saveShowGuides(true);
    expect(loadShowGuides()).toBe(true);
  });
});
