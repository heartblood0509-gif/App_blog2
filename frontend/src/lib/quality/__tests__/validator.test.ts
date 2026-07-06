import { describe, it, expect } from "vitest";
import { validateContent } from "../validator";
import { escapeRegExp } from "@/lib/utils";

const RANGE = { min: 1500, max: 2000 };

describe("escapeRegExp", () => {
  it("정규식 메타문자를 리터럴로 이스케이프한다", () => {
    expect(escapeRegExp("홈트(집에서)")).toBe("홈트\\(집에서\\)");
    expect(escapeRegExp("a.c")).toBe("a\\.c");
    expect(escapeRegExp("C++")).toBe("C\\+\\+");
    // 이스케이프한 문자열로 만든 RegExp 는 반드시 컴파일된다(SyntaxError 없음).
    expect(() => new RegExp(escapeRegExp("홈트(집에서)"))).not.toThrow();
  });
});

describe("validateContent — 키워드 정규식 안전성", () => {
  it("괄호가 든 키워드로도 예외 없이 리터럴 횟수를 센다 (원인 B: 기존엔 SyntaxError 500)", () => {
    const text = "홈트(집에서) 후기입니다. 오늘도 홈트(집에서) 했어요.";
    let result!: ReturnType<typeof validateContent>;
    expect(() => {
      result = validateContent(text, "홈트(집에서)", RANGE);
    }).not.toThrow();
    expect(result.keywordCount).toBe(2);
  });

  it("'.' 같은 메타문자는 임의문자 매칭이 아니라 리터럴로 센다 (조용한 오계산 방지)", () => {
    // 이스케이프가 없으면 /a.c/ 가 axc·abc 까지 매칭해 3회로 오계산된다.
    const text = "a.c 그리고 axc 그리고 abc";
    const result = validateContent(text, "a.c", RANGE);
    expect(result.keywordCount).toBe(1);
  });

  it("'C++' 같은 키워드도 예외 없이 처리한다", () => {
    const text = "C++ 입문. C++ 는 강력하다.";
    let result!: ReturnType<typeof validateContent>;
    expect(() => {
      result = validateContent(text, "C++", RANGE);
    }).not.toThrow();
    expect(result.keywordCount).toBe(2);
  });
});

describe("validateContent — 빈/누락 키워드 (원인 A)", () => {
  it("빈 키워드는 예외 없이 횟수·밀도 0으로 처리한다", () => {
    const text = "키워드 없이 쓰는 브랜드 소개 글입니다.";
    let result!: ReturnType<typeof validateContent>;
    expect(() => {
      result = validateContent(text, "", RANGE);
    }).not.toThrow();
    expect(result.keywordCount).toBe(0);
    expect(result.keywordDensity).toBe(0);
  });

  it("keyword 가 undefined 로 와도 방어적으로 처리한다 (.trim() 500 방지)", () => {
    const text = "본문만 있고 키워드는 안 넘어온 경우.";
    expect(() => {
      // 라우트에서 정규화하지만, validateContent 자체도 방어해야 한다.
      validateContent(text, undefined as unknown as string, RANGE);
    }).not.toThrow();
  });
});
