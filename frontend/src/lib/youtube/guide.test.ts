import { describe, it, expect } from "vitest";
import {
  GUIDE_SAFE,
  subtitleStrokePx,
  centeredWidthOverflowsSafe,
  subtitleDisplayLines,
  displayLineOverflowsGuide,
  overflowingDisplayLines,
  anyChunkOverflowsGuide,
  type SubtitleStyle,
  type WidthMeasurer,
} from "./guide";

// 측정기를 주입해 폰트/canvas 없이 순수 기하만 검증한다(브라우저 measureText 대체).
// 글자 1개 = pxPerChar 폭으로 가정 → 넘침 경계를 손으로 계산해 맞춘다.
function fixedMeasurer(pxPerChar: number): WidthMeasurer {
  return (text) => text.length * pxPerChar;
}

const baseStyle = (over: Partial<SubtitleStyle> = {}): SubtitleStyle => ({
  sizePx: 55,
  dx: 0,
  fontFamily: "'TF-Pretendard'",
  fontWeight: 800,
  ...over,
});

describe("centeredWidthOverflowsSafe — 안전선(x100~980, 폭 880) 가로 판정", () => {
  it("폭 880 이하는 중앙에서 안 넘친다", () => {
    expect(centeredWidthOverflowsSafe(880, 0)).toBe(false);
    expect(centeredWidthOverflowsSafe(881, 0)).toBe(true);
  });

  it("dx 로 옮기면 옮긴 위치 기준으로 넘침이 바뀐다", () => {
    // 폭 800(중앙에선 여유) 이지만 오른쪽으로 60 옮기면 오른쪽 끝이 안전선(980)을 넘는다.
    expect(centeredWidthOverflowsSafe(800, 0)).toBe(false); // left140 right940
    expect(centeredWidthOverflowsSafe(800, 60)).toBe(true); // right 1000 > 980
    expect(centeredWidthOverflowsSafe(800, -60)).toBe(true); // left 80 < 100
  });

  it("안전선 폭은 880(=980-100)", () => {
    expect(GUIDE_SAFE.right - GUIDE_SAFE.left).toBe(880);
  });
});

describe("subtitleStrokePx — 백엔드 sub_border 와 동일", () => {
  it("55px 기준 3px, 크기에 비례", () => {
    expect(subtitleStrokePx(55)).toBe(3);
    expect(subtitleStrokePx(110)).toBe(6);
    expect(subtitleStrokePx(18)).toBe(1); // 하한 1
  });
});

describe("displayLineOverflowsGuide — 실측 기반 한 줄 판정", () => {
  it("테두리 두께가 폭에 가산돼 경계에서 넘침이 바뀐다", () => {
    // 8글자×109 = 872 (여유). +테두리 2×3=6 → 878, 아직 여유(880 이하).
    const m = fixedMeasurer(109);
    // 8글자 = 872+6 = 878 → 안 넘침
    expect(displayLineOverflowsGuide("가나다라마바사아", baseStyle(), m)).toBe(false);
    // 9글자 = 981+6 = 987 → 넘침
    expect(displayLineOverflowsGuide("가나다라마바사아자", baseStyle(), m)).toBe(true);
  });

  it("글자 크기를 줄이면(측정 폭이 줄어) 넘침이 해제된다", () => {
    // 측정기는 size 에 비례하게: 글자당 size px.
    const m: WidthMeasurer = (text, sizePx) => text.length * sizePx;
    const text = "가나다라마바사아자차카타파하"; // 14글자
    expect(displayLineOverflowsGuide(text, baseStyle({ sizePx: 70 }), m)).toBe(true); // 14*70=980+
    expect(displayLineOverflowsGuide(text, baseStyle({ sizePx: 36 }), m)).toBe(false); // 14*36=504
  });

  it("마침표는 폭 계산에서 빠진다", () => {
    // 측정기가 실제로 받는 텍스트에서 마침표가 제거됐는지 — 길이로 확인.
    let seen = "";
    const m: WidthMeasurer = (text) => {
      seen = text;
      return 0;
    };
    displayLineOverflowsGuide("안녕. 하세요.", baseStyle(), m);
    expect(seen).toBe("안녕 하세요");
  });

  it("NFD(자모 분해) 입력도 NFC 로 정규화돼 같은 판정", () => {
    const nfc = "두 마리를 소개합니다";
    const nfd = nfc.normalize("NFD");
    const m = fixedMeasurer(100);
    expect(displayLineOverflowsGuide(nfd, baseStyle(), m)).toBe(
      displayLineOverflowsGuide(nfc, baseStyle(), m),
    );
    // 측정기가 NFC 텍스트(짧은 길이)를 받는지 직접 확인.
    let seen = "";
    const spy: WidthMeasurer = (text) => {
      seen = text;
      return 0;
    };
    displayLineOverflowsGuide(nfd, baseStyle(), spy);
    expect(seen).toBe(nfc);
  });

  it("빈 줄은 넘치지 않는다", () => {
    expect(displayLineOverflowsGuide("   ", baseStyle(), fixedMeasurer(999))).toBe(false);
  });
});

describe("subtitleDisplayLines — 조각을 화면 줄로 펼침(\\n = 화면 줄바꿈)", () => {
  it("조각별 개행을 화면 줄로 나누고 빈 줄은 버린다", () => {
    expect(subtitleDisplayLines(["첫 컷", "둘째 컷\n두 번째 줄"])).toEqual([
      "첫 컷",
      "둘째 컷",
      "두 번째 줄",
    ]);
    expect(subtitleDisplayLines(["  ", "내용\n\n"])).toEqual(["내용"]);
  });
});

describe("overflowingDisplayLines / anyChunkOverflowsGuide", () => {
  it("화면 줄별 넘침 배열을 화면 줄 순서로 돌려준다", () => {
    const m = fixedMeasurer(100);
    // "짧다"(2) 안 넘침, "아주아주아주아주긴한줄"(11글자=1100) 넘침
    const chunks = ["짧다", "아주아주아주아주긴한줄"];
    expect(overflowingDisplayLines(chunks, baseStyle(), m)).toEqual([false, true]);
    expect(anyChunkOverflowsGuide(chunks, baseStyle(), m)).toBe(true);
  });

  it("모두 여유면 any=false", () => {
    const m = fixedMeasurer(50);
    expect(anyChunkOverflowsGuide(["가나다", "라마바"], baseStyle(), m)).toBe(false);
  });
});
