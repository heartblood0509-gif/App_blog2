import { describe, expect, it } from "vitest";
import { sameText, toStoredForm } from "./text-form";

// 실제 버그 재현 문장: 맥에서 붙여넣은 대본의 한 줄을 고쳤더니, 서버는 완성형으로 저장하고
// 화면은 분해형을 들고 있어 그 줄이 영원히 '수정됨'이 됐다(길이가 안 뜨고 버튼이 안 바뀜).
const NFC = "먼저 첫째, 토리입니다.";
const NFD = NFC.normalize("NFD");

describe("sameText", () => {
  it("표기형만 다른 같은 글자는 같다고 본다", () => {
    // 전제: 두 문자열은 실제로 서로 다른 바이트열이다(테스트가 무의미해지지 않게 확인)
    expect(NFD).not.toBe(NFC);
    expect(sameText(NFD, NFC)).toBe(true);
    expect(sameText(NFC, NFD)).toBe(true);
  });

  it("글자가 진짜 다르면 다르다고 본다", () => {
    expect(sameText("먼저 첫째, 토리입니다.", "먼저 둘째, 토리입니다.")).toBe(false);
    // 붙여쓰기 변경(이번 사례의 실제 편집)도 잡아내야 한다
    expect(sameText("먼저 첫 째, 토리입니다.", "먼저 첫째, 토리입니다.")).toBe(false);
  });

  it("공백·구두점 차이는 그대로 다르다(정규화가 과하게 흡수하지 않는다)", () => {
    expect(sameText("토리입니다", "토리입니다.")).toBe(false);
    expect(sameText("토리 입니다", "토리입니다")).toBe(false);
  });

  it("빈 값·없는 값을 안전하게 다룬다", () => {
    expect(sameText(undefined, "")).toBe(true);
    expect(sameText(null, undefined)).toBe(true);
    expect(sameText(undefined, "가")).toBe(false);
  });
});

describe("toStoredForm", () => {
  it("서버가 저장하는 형태(완성형)로 바꾼다", () => {
    expect(toStoredForm(NFD)).toBe(NFC);
    expect(toStoredForm(NFC)).toBe(NFC);
  });

  it("보이는 글자는 바뀌지 않는다", () => {
    expect(toStoredForm(NFD).normalize("NFD")).toBe(NFD);
  });

  it("저장 형태끼리는 항상 단순 비교가 통한다", () => {
    expect(toStoredForm(NFD) === toStoredForm(NFC)).toBe(true);
  });
});
