import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bumpRegenUses, loadRegenUses, REGEN_LABEL_USES } from "./regen-hint";

// vitest 환경이 node 라 window/localStorage 가 없다. 브라우저를 흉내 내 두 경우를 모두 본다.
function fakeBrowser(store: Record<string, string> = {}) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("브라우저에서", () => {
  beforeEach(() => fakeBrowser());

  it("처음엔 0 이라 버튼에 글자가 보인다", () => {
    expect(loadRegenUses()).toBe(0);
    expect(loadRegenUses() < REGEN_LABEL_USES).toBe(true);
  });

  it("쓸 때마다 1씩 늘고 저장된다", () => {
    expect(bumpRegenUses()).toBe(1);
    expect(bumpRegenUses()).toBe(2);
    expect(loadRegenUses()).toBe(2);
  });

  it("정해진 횟수를 채우면 글자를 접는다(아이콘만)", () => {
    for (let i = 0; i < REGEN_LABEL_USES; i++) bumpRegenUses();
    expect(loadRegenUses() >= REGEN_LABEL_USES).toBe(true);
  });

  it("저장값이 깨져 있어도 0 으로 안전하게 떨어진다", () => {
    fakeBrowser({ "blogpick-yt-regen-uses": "이상한값" });
    expect(loadRegenUses()).toBe(0);
    fakeBrowser({ "blogpick-yt-regen-uses": "-5" });
    expect(loadRegenUses()).toBe(0);
  });
});

describe("저장이 막힌 환경(프라이빗 모드 등)", () => {
  it("setItem 이 던져도 앱이 죽지 않는다", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => bumpRegenUses()).not.toThrow();
    expect(bumpRegenUses()).toBe(1); // 이번 세션 값은 돌려준다
  });
});

describe("서버 렌더(window 없음)", () => {
  it("0 을 돌려줘 글자가 보이는 쪽으로 안전하게 기운다", () => {
    expect(loadRegenUses()).toBe(0);
    expect(() => bumpRegenUses()).not.toThrow();
  });
});
