import { describe, it, expect } from "vitest";
import { maskSecrets } from "../log";

describe("maskSecrets", () => {
  it("Google(AIza…) 키를 가린다", () => {
    const s = maskSecrets("error: key AIzaSyD0123456789abcdefghijklmnopqrstuvw failed");
    expect(s).not.toContain("AIzaSyD0123456789");
    expect(s).toContain("***");
  });

  it("OpenAI(sk-…) 키를 가린다", () => {
    const s = maskSecrets("auth sk-proj-abcdEF0123456789ghijklmnop invalid");
    expect(s).not.toContain("sk-proj-abcdEF0123456789");
    expect(s).toContain("***");
  });

  it("fal(id:secret) 키를 가린다", () => {
    const s = maskSecrets(
      "[fal] a1b2c3d4-e5f6-7890-abcd-ef1234567890:abcdef0123456789abcdef0123456789 bad"
    );
    expect(s).not.toContain("abcdef0123456789abcdef0123456789");
    expect(s).toContain("***");
  });

  it("키가 없으면 원문 보존", () => {
    expect(maskSecrets("plain error message")).toBe("plain error message");
  });
});
