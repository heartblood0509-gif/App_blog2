import { describe, it, expect } from "vitest";
import { enforceImageMarkerCap, parseImageMarkers } from "../marker-parser";

function countMarkers(content: string): number {
  return (content.match(/^\s*\[이미지:.+\]\s*$/gm) || []).length;
}

function hasSubtitleImage(content: string, subtitleText: string): boolean {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{2,3}(\{[^}]+\})?\s+(.+)$/);
    if (!m) continue;
    if (m[2].trim() !== subtitleText) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j < lines.length && /^\s*\[이미지:.+\]\s*$/.test(lines[j])) return true;
  }
  return false;
}

const HOOK = "[이미지: 후킹 대표 컷, 자연광]";
function subtitle(text: string, style?: string): string {
  return style ? `##{${style}} ${text}` : `## ${text}`;
}
function marker(desc: string): string {
  return `[이미지: ${desc}]`;
}
function paragraph(text: string): string {
  return text;
}
function blank(): string {
  return "";
}

function buildContent(parts: string[]): string {
  return parts.join("\n");
}

describe("enforceImageMarkerCap — 1. 캡 이하 no-op", () => {
  it("후기성 8장은 그대로", () => {
    const content = buildContent([
      HOOK,
      blank(),
      paragraph("도입부 한 문단. 어느 날 그 일이 있었다."),
      blank(),
      subtitle("첫 번째 소제목"),
      blank(),
      marker("첫째 장면"),
      blank(),
      paragraph("본문 1."),
      blank(),
      subtitle("두 번째 소제목"),
      blank(),
      marker("둘째 장면"),
      blank(),
      paragraph("본문 2."),
      blank(),
      subtitle("세 번째 소제목"),
      blank(),
      marker("셋째 장면"),
      blank(),
      paragraph("본문 3."),
      blank(),
      subtitle("네 번째 소제목"),
      blank(),
      marker("넷째 장면"),
      blank(),
      paragraph("본문 4."),
      blank(),
      subtitle("다섯 번째 소제목"),
      blank(),
      marker("다섯째 장면"),
      blank(),
      paragraph("본문 5."),
      blank(),
      marker("추가 채움 1"),
      blank(),
      paragraph("본문 6."),
      blank(),
      marker("추가 채움 2"),
    ]);
    expect(countMarkers(content)).toBe(8);
    const result = enforceImageMarkerCap(content, 12);
    expect(countMarkers(result)).toBe(8);
    expect(result).toBe(content);
  });
});

describe("enforceImageMarkerCap — 2. 후기성 폭증 14장 → 12장", () => {
  it("HOOK + 소제목 5 직후 모두 보존, 채움 8 중 2장 컷", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("도입부."), blank());
    for (let i = 1; i <= 5; i++) {
      parts.push(subtitle(`소제목${i}`), blank());
      parts.push(marker(`소제목${i} 직후 장면`), blank());
      parts.push(paragraph(`본문${i}-A.`), blank());
      parts.push(marker(`채움${i}-A`), blank());
      parts.push(paragraph(`본문${i}-B.`), blank());
    }
    parts.push(marker("끝 채움 1"), blank());
    parts.push(marker("끝 채움 2"), blank());
    parts.push(marker("끝 채움 3"));

    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(14);
    const result = enforceImageMarkerCap(content, 12);
    expect(countMarkers(result)).toBeLessThanOrEqual(12);
    expect(countMarkers(result)).toBeGreaterThanOrEqual(10);
    for (let i = 1; i <= 5; i++) {
      expect(hasSubtitleImage(result, `소제목${i}`)).toBe(true);
    }
    expect(result.split("\n")[0]).toMatch(/^\[이미지:/);
  });
});

describe("enforceImageMarkerCap — 3. ##{style} 헤더 인식", () => {
  it("브랜드 스타일 마커 헤더 소제목 직후 이미지 모두 보존", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("브랜드 도입."), blank());
    const styles = ["postit", "line", "underline", "bubble", "corner"];
    for (let i = 0; i < 5; i++) {
      parts.push(subtitle(`스타일소제목${i + 1}`, styles[i]), blank());
      parts.push(marker(`스타일${i + 1} 직후`), blank());
      parts.push(paragraph(`내용${i + 1}-A.`), blank());
      parts.push(marker(`채움${i + 1}`), blank());
      parts.push(paragraph(`내용${i + 1}-B.`), blank());
    }
    parts.push(marker("말미 채움 1"), blank());
    parts.push(marker("말미 채움 2"), blank());
    parts.push(marker("말미 채움 3"));

    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(14);
    const result = enforceImageMarkerCap(content, 12);
    expect(countMarkers(result)).toBeLessThanOrEqual(12);
    for (let i = 1; i <= 5; i++) {
      expect(hasSubtitleImage(result, `스타일소제목${i}`)).toBe(true);
    }
  });
});

describe("enforceImageMarkerCap — 4. 브랜드 극단 폭증 18장 → 12장", () => {
  it("소제목 5 + 열거 5 + 채움 7 + HOOK = 18장 입력에서 소제목 모두 보존", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("브랜드 글 도입부."), blank());
    parts.push(subtitle("문제 인식", "postit"), blank());
    parts.push(marker("문제 인식 직후 장면"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(subtitle("핵심 원인", "postit"), blank());
    parts.push(marker("핵심 원인 직후"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(subtitle("해결책 다섯 가지", "postit"), blank());
    parts.push(marker("해결책 안내 장면"), blank());
    for (let i = 1; i <= 5; i++) {
      parts.push(marker(`열거${i} 위 이미지`), blank());
      parts.push(paragraph(`${i}째 - 항목 설명입니다.`), blank());
    }
    parts.push(subtitle("실제 후기", "postit"), blank());
    parts.push(marker("후기 직후 장면"), blank());
    parts.push(paragraph("후기 본문 1."), blank());
    parts.push(marker("후기 본문 채움 1"), blank());
    parts.push(paragraph("후기 본문 2."), blank());
    parts.push(marker("후기 본문 채움 2"), blank());
    parts.push(subtitle("정리", "underline"), blank());
    parts.push(marker("정리 직후 장면"), blank());
    parts.push(paragraph("마무리1."), blank());
    parts.push(marker("마무리 채움 1"), blank());
    parts.push(paragraph("마무리2."), blank());
    parts.push(marker("마무리 채움 2"), blank());
    parts.push(paragraph("마무리3."), blank());
    parts.push(marker("마무리 채움 3"), blank());
    parts.push(paragraph("마무리4."), blank());
    parts.push(marker("마무리 채움 4"), blank());
    parts.push(paragraph("마무리5."), blank());
    parts.push(marker("마무리 채움 5"));

    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(18);
    const result = enforceImageMarkerCap(content, 12);
    expect(countMarkers(result)).toBeLessThanOrEqual(12);
    expect(countMarkers(result)).toBeGreaterThanOrEqual(10);
    expect(hasSubtitleImage(result, "문제 인식")).toBe(true);
    expect(hasSubtitleImage(result, "핵심 원인")).toBe(true);
    expect(hasSubtitleImage(result, "해결책 다섯 가지")).toBe(true);
    expect(hasSubtitleImage(result, "실제 후기")).toBe(true);
    expect(hasSubtitleImage(result, "정리")).toBe(true);
  });
});

describe("enforceImageMarkerCap — 5. 페어 원자 컷", () => {
  it("전/후 비교 페어가 함께 컷되거나 함께 보존", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("도입부."), blank());
    parts.push(subtitle("소제목1"), blank());
    parts.push(marker("소제목1 직후"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("페어 전 - 사용 전 모습"), blank());
    parts.push(marker("페어 후 - 사용 후 모습"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(subtitle("소제목2"), blank());
    parts.push(marker("소제목2 직후"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("채움1"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("채움2"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("채움3"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("채움4"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("채움5"), blank());
    parts.push(paragraph("본문."), blank());
    parts.push(marker("채움6"));

    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(11);

    const inflated = content + "\n\n본문.\n\n" + marker("채움7") + "\n\n본문.\n\n" + marker("채움8");
    expect(countMarkers(inflated)).toBe(13);
    const result = enforceImageMarkerCap(inflated, 12);
    expect(countMarkers(result)).toBeLessThanOrEqual(12);
    expect(countMarkers(result)).toBeGreaterThanOrEqual(10);

    const slots = parseImageMarkers(result);
    const pairs = slots.filter((s) => s.groupId);
    const pairGroups = new Map<string, number>();
    for (const s of pairs) {
      pairGroups.set(s.groupId!, (pairGroups.get(s.groupId!) || 0) + 1);
    }
    for (const count of pairGroups.values()) {
      expect(count).toBe(2);
    }
  });
});

describe("enforceImageMarkerCap — 6. AEO 폭증 12장 → 8장", () => {
  it("AEO 상한 8장으로 컷, 소제목 4개 모두 보존", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("AEO 도입 — 한 문장 답."), blank());
    for (let i = 1; i <= 4; i++) {
      parts.push(subtitle(`AEO소제목${i}`, "postit"), blank());
      parts.push(marker(`AEO소제목${i} 직후`), blank());
      parts.push(paragraph(`정보${i}.`), blank());
      parts.push(marker(`AEO채움${i}`), blank());
      parts.push(paragraph(`정보${i}-2.`), blank());
    }
    parts.push(marker("끝 채움 1"), blank());
    parts.push(marker("끝 채움 2"), blank());
    parts.push(marker("끝 채움 3"));

    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(12);
    const result = enforceImageMarkerCap(content, 8);
    expect(countMarkers(result)).toBeLessThanOrEqual(8);
    expect(countMarkers(result)).toBeGreaterThanOrEqual(6);
    for (let i = 1; i <= 4; i++) {
      expect(hasSubtitleImage(result, `AEO소제목${i}`)).toBe(true);
    }
  });
});

describe("enforceImageMarkerCap — 7. 후보 후반 클러스터", () => {
  it("후보가 글 후반에 몰려있어도 전역 lineIndex 균등으로 컷이 분산", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("도입부 전반에 후보가 있다."), blank());
    parts.push(marker("전반 후보1"), blank());
    parts.push(paragraph("내용."), blank());
    parts.push(subtitle("중간 소제목1"), blank());
    parts.push(marker("중간 소제목1 직후"), blank());
    for (let i = 0; i < 6; i++) {
      parts.push(paragraph(`긴 본문 ${i}.`), blank());
    }
    parts.push(subtitle("후반 소제목2"), blank());
    parts.push(marker("후반 소제목2 직후"), blank());
    parts.push(paragraph("후반."), blank());
    parts.push(marker("후반 후보1"), blank());
    parts.push(paragraph("후반."), blank());
    parts.push(marker("후반 후보2"), blank());
    parts.push(paragraph("후반."), blank());
    parts.push(marker("후반 후보3"), blank());
    parts.push(paragraph("후반."), blank());
    parts.push(marker("후반 후보4"), blank());
    parts.push(paragraph("후반."), blank());
    parts.push(marker("후반 후보5"), blank());
    parts.push(paragraph("후반."), blank());
    parts.push(marker("후반 후보6"));

    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(10);
    const result = enforceImageMarkerCap(content, 8);
    expect(countMarkers(result)).toBeLessThanOrEqual(8);
    expect(hasSubtitleImage(result, "중간 소제목1")).toBe(true);
    expect(hasSubtitleImage(result, "후반 소제목2")).toBe(true);

    const resultSlots = parseImageMarkers(result);
    const firstHalfMax = result.split("\n").length / 2;
    const firstHalfMarkers = resultSlots.filter((s) => s.lineIndex < firstHalfMax).length;
    expect(firstHalfMarkers).toBeGreaterThan(0);
  });
});

describe("enforceImageMarkerCap — 회귀: 극단 케이스", () => {
  it("소제목 13개로 보존만 13장 초과 → 강제 컷 없이 그대로", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("도입."), blank());
    for (let i = 1; i <= 13; i++) {
      parts.push(subtitle(`소제목${i}`), blank());
      parts.push(marker(`소제목${i} 직후`), blank());
      parts.push(paragraph(`본문${i}.`), blank());
    }
    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(14);
    const result = enforceImageMarkerCap(content, 12);
    expect(countMarkers(result)).toBe(14);
  });

  it("마커 0개 본문 → no-op", () => {
    const content = "도입부 한 줄.\n\n## 소제목\n\n본문.";
    const result = enforceImageMarkerCap(content, 12);
    expect(result).toBe(content);
  });
});

describe("enforceImageMarkerCap — hardCap (seoAeo Intent 모드)", () => {
  // AEO Intent 모드 가정: 본문 1·2·3 + FAQ + 정리 = 5개 소제목 직후 이미지가 모두 보호되어
  // 기본 동작에서는 maxCount=4가 무효화됨. hardCap=true 로 강제 컷 가능해야 함.
  it("5개 소제목 + HOOK = 6개 보호 → hardCap=false 면 그대로", () => {
    const parts: string[] = [HOOK, blank(), paragraph("도입부."), blank()];
    const titles = ["본문 1", "본문 2", "본문 3", "FAQ", "정리"];
    for (const t of titles) {
      parts.push(subtitle(t, "postit"), blank());
      parts.push(marker(`${t} 직후 이미지`), blank());
      parts.push(paragraph(`${t} 본문.`), blank());
    }
    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(6);
    // 기존 동작: 보호 슬롯 6개 ≥ maxCount 4 → 그대로 return
    const result = enforceImageMarkerCap(content, 4);
    expect(countMarkers(result)).toBe(6);
  });

  it("5개 소제목 + HOOK = 6개 보호 → hardCap=true 면 lineIndex 빠른 4개만 유지", () => {
    const parts: string[] = [HOOK, blank(), paragraph("도입부."), blank()];
    const titles = ["본문 1", "본문 2", "본문 3", "FAQ", "정리"];
    for (const t of titles) {
      parts.push(subtitle(t, "postit"), blank());
      parts.push(marker(`${t} 직후 이미지`), blank());
      parts.push(paragraph(`${t} 본문.`), blank());
    }
    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(6);
    const result = enforceImageMarkerCap(content, 4, { hardCap: true });
    expect(countMarkers(result)).toBe(4);
    // HOOK + 본문 1·2·3 직후 4개가 살아남고 FAQ·정리 직후는 제거
    expect(hasSubtitleImage(result, "본문 1")).toBe(true);
    expect(hasSubtitleImage(result, "본문 2")).toBe(true);
    expect(hasSubtitleImage(result, "본문 3")).toBe(true);
    expect(hasSubtitleImage(result, "FAQ")).toBe(false);
    expect(hasSubtitleImage(result, "정리")).toBe(false);
  });

  it("실전 시나리오: 16장(소제목 직후 + 본문 중간 채움) → hardCap=true + maxCount=4 → 4장", () => {
    const parts: string[] = [HOOK, blank(), paragraph("도입부."), blank()];
    parts.push(marker("도입부 중간 채움"), blank());
    const titles = ["본문 1", "본문 2", "본문 3", "FAQ", "정리"];
    for (const t of titles) {
      parts.push(subtitle(t, "postit"), blank());
      parts.push(marker(`${t} 직후 이미지`), blank());
      parts.push(paragraph(`${t} 본문.`), blank());
      parts.push(marker(`${t} 본문 중간 채움`), blank());
      parts.push(paragraph(`${t} 추가 본문.`), blank());
    }
    const content = buildContent(parts);
    expect(countMarkers(content)).toBe(12);
    const result = enforceImageMarkerCap(content, 4, { hardCap: true });
    expect(countMarkers(result)).toBe(4);
  });

  it("회귀 보호: hardCap 옵션 미지정 시 기존 동작과 byte-identical", () => {
    const parts: string[] = [HOOK, blank()];
    parts.push(paragraph("도입."), blank());
    for (let i = 1; i <= 13; i++) {
      parts.push(subtitle(`소제목${i}`), blank());
      parts.push(marker(`소제목${i} 직후`), blank());
      parts.push(paragraph(`본문${i}.`), blank());
    }
    const content = buildContent(parts);
    const resultNoOpt = enforceImageMarkerCap(content, 12);
    const resultDefault = enforceImageMarkerCap(content, 12, {});
    const resultFalse = enforceImageMarkerCap(content, 12, { hardCap: false });
    expect(resultNoOpt).toBe(content); // 기존 회귀 테스트와 동일
    expect(resultDefault).toBe(resultNoOpt);
    expect(resultFalse).toBe(resultNoOpt);
  });
});
