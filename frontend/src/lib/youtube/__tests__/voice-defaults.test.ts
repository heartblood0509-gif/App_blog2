import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadLastVoice } from "../voice-defaults";
import { VOICE_OPTIONS } from "../voices";

// vitest 환경이 node 라 window/localStorage 가 없다 → SSR 가드를 통과시키려면 직접 심는다.
const store = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };

function seed(value: unknown) {
  store.clear();
  store.set("blogpick-yt-voice-prefs", JSON.stringify(value));
}

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

const CHANGSU = VOICE_OPTIONS.find((v) => v.label.startsWith("창수"))!.value;

describe("loadLastVoice", () => {
  it("returns {} when nothing saved", () => {
    expect(loadLastVoice()).toEqual({});
  });

  it("returns {} on corrupt JSON", () => {
    store.set("blogpick-yt-voice-prefs", "{not json");
    expect(loadLastVoice()).toEqual({});
  });

  it("restores a known typecast voice", () => {
    seed({ engine: "typecast", voiceId: CHANGSU, ttsSpeed: 1.2 });
    const out = loadLastVoice();
    expect(out.engine).toBe("typecast");
    expect(out.voiceId).toBe(CHANGSU);
    expect(out.ttsSpeed).toBe(1.2);
  });

  it("drops a typecast voice that is no longer in the list", () => {
    // 성우 목록에서 빠진 옛 id 를 그대로 쓰면 선택칸이 비어 보인다 → 기본값으로 폴백시킨다.
    seed({ engine: "typecast", voiceId: "tc_deleted_voice" });
    expect(loadLastVoice().voiceId).toBeUndefined();
  });

  it("keeps an elevenlabs voice id (계정별이라 검증 불가)", () => {
    seed({ engine: "elevenlabs", voiceId: "el_clone_123" });
    const out = loadLastVoice();
    expect(out.engine).toBe("elevenlabs");
    expect(out.voiceId).toBe("el_clone_123");
  });

  it("forces empty voice when elevenlabs has none — 엔진·음성 불일치 방지", () => {
    seed({ engine: "elevenlabs" });
    expect(loadLastVoice().voiceId).toBe("");
  });

  it("falls back to typecast for an unknown engine", () => {
    seed({ engine: "bogus", voiceId: CHANGSU });
    expect(loadLastVoice().engine).toBe("typecast");
  });

  it("clamps and rejects bad numeric values", () => {
    seed({ ttsSpeed: 99, elStability: -5, elSimilarity: "x", elStyle: NaN });
    const out = loadLastVoice();
    expect(out.ttsSpeed).toBe(2);
    expect(out.elStability).toBe(0);
    expect(out.elSimilarity).toBeUndefined();
    expect(out.elStyle).toBeUndefined();
  });

  it("rejects an unknown elevenlabs model", () => {
    seed({ elModel: "eleven_made_up" });
    expect(loadLastVoice().elModel).toBeUndefined();
  });

  it("does not remember emotion (성우 바꾸면 normal 로 돌아가는 규칙)", () => {
    seed({ engine: "typecast", voiceId: CHANGSU, emotion: "happy" });
    expect(loadLastVoice()).not.toHaveProperty("emotion");
  });

  it("returns {} on the server (window 없음)", () => {
    seed({ engine: "typecast", voiceId: CHANGSU });
    delete g.window;
    expect(loadLastVoice()).toEqual({});
  });
});
