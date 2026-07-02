import { describe, it, expect } from "vitest";
import {
  enforceImageMarkerCap,
  parseImageMarkers,
  pruneExcludedMarkers,
  computeBlocks,
  moveMarkerBlock,
  moveMarkerToBoundary,
  insertEmptyMarkerAtBoundary,
  markerIndexAtBoundary,
} from "../marker-parser";

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

// ─────────────────────────────────────────────────────────────────────────────
// 수동 이미지 배치 (넣기/빼기/옮기기) — 순수 변환 + id 보존 불변식
// ─────────────────────────────────────────────────────────────────────────────

/** description → id 맵. 유니크 description 가정 하에 "이미지가 마커를 따라가는지" 검증용. */
function descToId(slots: { id: string; description: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of slots) m[s.description] = s.id;
  return m;
}

/** page.tsx handleMoveSlot 의 id 배정 로직을 순수 시뮬레이션. */
function applyMove(
  content: string,
  oldIds: string[],
  slotIndex: number,
  dir: "up" | "down"
) {
  const { content: newContent, adjacentWasMarker } = moveMarkerBlock(content, slotIndex, dir);
  const ids = [...oldIds];
  if (adjacentWasMarker && newContent !== content) {
    const j = dir === "up" ? slotIndex - 1 : slotIndex + 1;
    [ids[slotIndex], ids[j]] = [ids[j], ids[slotIndex]];
  }
  const parsed = parseImageMarkers(newContent);
  const slots = parsed.map((s, i) => ({ ...s, id: ids[i] }));
  return { newContent, slots };
}

describe("computeBlocks — 블록 분해", () => {
  it("마커/소제목/본문을 각각 단독 블록으로, 마커에 순서 부여", () => {
    const content = buildContent([
      marker("A"),
      blank(),
      subtitle("소제목"),
      blank(),
      paragraph("본문 한 줄."),
      blank(),
      marker("B"),
    ]);
    const blocks = computeBlocks(content);
    expect(blocks.map((b) => b.kind)).toEqual(["marker", "heading", "text", "marker"]);
    const markers = blocks.filter((b) => b.kind === "marker");
    expect(markers.map((b) => b.markerIndex)).toEqual([0, 1]);
  });

  it("연속된 본문 줄은 하나의 text 블록으로 묶음", () => {
    const content = "본문1\n본문2\n본문3\n\n[이미지: X]";
    const blocks = computeBlocks(content);
    expect(blocks[0]).toMatchObject({ kind: "text", lineStart: 0, lineEnd: 2 });
    expect(blocks[1].kind).toBe("marker");
  });
});

describe("moveMarkerBlock — 문단 단위 이동", () => {
  const base = buildContent([
    marker("A"),
    blank(),
    paragraph("문단1"),
    blank(),
    marker("B"),
  ]);

  it("본문을 지나 아래로 이동: 마커 순서 불변, 이미지(id) 따라감", () => {
    const oldSlots = parseImageMarkers(base);
    const oldIds = oldSlots.map((s) => s.id);
    const before = descToId(oldSlots);

    const { newContent, slots } = applyMove(base, oldIds, 0, "down");
    // A 가 문단1 아래로 → 마커 순서(A,B)는 그대로
    expect(slots.map((s) => s.description)).toEqual(["A", "B"]);
    expect(descToId(slots)).toEqual(before); // 이미지-마커 연결 보존
    // A 의 lineIndex 가 문단1 아래로 내려감
    const aNew = slots.find((s) => s.description === "A")!;
    expect(newContent.split("\n")[aNew.lineIndex]).toContain("[이미지: A]");
  });

  it("다른 마커를 지나 이동하면 순서가 바뀌고 id도 함께 swap", () => {
    const ab = "[이미지: A]\n\n[이미지: B]";
    const oldSlots = parseImageMarkers(ab);
    const oldIds = oldSlots.map((s) => s.id);
    const before = descToId(oldSlots);

    const { slots } = applyMove(ab, oldIds, 0, "down");
    expect(slots.map((s) => s.description)).toEqual(["B", "A"]); // 순서 뒤바뀜
    expect(descToId(slots)).toEqual(before); // 그래도 이미지는 각자 마커를 따라감
  });

  it("2회 이동(down→up)은 원래 본문으로 복원(멱등 역연산)", () => {
    const ab = "[이미지: A]\n\n[이미지: B]";
    const down = moveMarkerBlock(ab, 0, "down").content;
    // A 는 이제 index 1
    const back = moveMarkerBlock(down, 1, "up").content;
    expect(back).toBe(ab);
  });

  it("첫 마커를 위로 / 마지막 마커를 아래로 = no-op", () => {
    expect(moveMarkerBlock(base, 0, "up").content).toBe(base);
    expect(moveMarkerBlock(base, 1, "down").content).toBe(base);
  });
});

describe("insertEmptyMarkerAtBoundary — 문단 사이 추가", () => {
  const base = buildContent([
    marker("A"),
    blank(),
    paragraph("문단1"),
    blank(),
    marker("B"),
  ]);

  it("블록 경계에 마커 1개 삽입, 재파싱 시 N+1, 정확한 위치", () => {
    // blocks: [A(0), 문단1(1), B(2)] → boundary 2 = 문단1 뒤 / B 앞
    const idx = markerIndexAtBoundary(base, 2);
    expect(idx).toBe(1); // A 다음, B 앞 = 새 마커는 1번째
    const next = insertEmptyMarkerAtBoundary(base, 2, "NEW");
    const slots = parseImageMarkers(next);
    expect(slots.map((s) => s.description)).toEqual(["A", "NEW", "B"]);
    // 중복 빈 줄 없음
    expect(next).not.toMatch(/\n\n\n/);
  });

  it("맨 위(boundary 0) 삽입 시 새 마커가 첫 번째", () => {
    const next = insertEmptyMarkerAtBoundary(base, 0, "TOP");
    const slots = parseImageMarkers(next);
    expect(slots[0].description).toBe("TOP");
    expect(markerIndexAtBoundary(base, 0)).toBe(0);
  });

  it("id 보존: 기존 이미지는 그대로, 새 자리만 새 id (add 시뮬레이션)", () => {
    const oldSlots = parseImageMarkers(base);
    const oldIds = oldSlots.map((s) => s.id);
    const before = descToId(oldSlots);

    const insertIndex = markerIndexAtBoundary(base, 2);
    const next = insertEmptyMarkerAtBoundary(base, 2, "NEW");
    const newIds = [...oldIds];
    newIds.splice(insertIndex, 0, "fresh-id");
    const slots = parseImageMarkers(next).map((s, i) => ({ ...s, id: newIds[i] }));

    expect(descToId(slots).A).toBe(before.A);
    expect(descToId(slots).B).toBe(before.B);
    expect(descToId(slots).NEW).toBe("fresh-id");
  });
});

describe("삭제(pruneExcludedMarkers 재사용) + 발행 순서 불변식", () => {
  const base = buildContent([
    marker("A"),
    blank(),
    paragraph("본문."),
    blank(),
    marker("B"),
    blank(),
    paragraph("본문."),
    blank(),
    marker("C"),
  ]);

  it("가운데 마커 삭제 시 N-1, 나머지 이미지 연결 보존", () => {
    const oldSlots = parseImageMarkers(base);
    const before = descToId(oldSlots);
    const bId = oldSlots.find((s) => s.description === "B")!.id;

    const next = pruneExcludedMarkers(base, oldSlots, new Set([bId]));
    const remainIds = oldSlots.filter((s) => s.id !== bId).map((s) => s.id);
    const slots = parseImageMarkers(next).map((s, i) => ({ ...s, id: remainIds[i] }));

    expect(slots.map((s) => s.description)).toEqual(["A", "C"]);
    expect(descToId(slots).A).toBe(before.A);
    expect(descToId(slots).C).toBe(before.C);
  });

  it("[B4] 재배치 후에도 imageSlots 순서 = 마커 순서 = index (발행 순서 투영)", () => {
    const ab = "[이미지: A]\n\n[이미지: B]\n\n[이미지: C]";
    const oldIds = parseImageMarkers(ab).map((s) => s.id);
    const { newContent, slots } = applyMove(ab, oldIds, 1, "down"); // B 를 C 아래로
    // 본문 마커 등장 순서
    const markerOrder = (newContent.match(/\[이미지:\s*([^\]]+)\]/g) || []).map((m) =>
      m.replace(/\[이미지:\s*/, "").replace(/\]$/, "").trim()
    );
    expect(slots.map((s) => s.description)).toEqual(markerOrder); // 배열 순서 = 마커 순서
    slots.forEach((s, i) => expect(s.index).toBe(i)); // index 연속
  });
});

describe("moveMarkerToBoundary — 드래그(임의 위치) 재배치", () => {
  /** page.tsx handleMoveSlotToBoundary 의 id 배정 로직 시뮬레이션. */
  function applyMoveToBoundary(
    content: string,
    oldIds: string[],
    slotIndex: number,
    targetBoundary: number
  ) {
    const { content: newContent, newMarkerIndex } = moveMarkerToBoundary(
      content,
      slotIndex,
      targetBoundary
    );
    const ids = [...oldIds];
    const [movedId] = ids.splice(slotIndex, 1);
    ids.splice(newMarkerIndex, 0, movedId);
    const slots = parseImageMarkers(newContent).map((s, i) => ({ ...s, id: ids[i] }));
    return { newContent, slots };
  }

  const base = buildContent([
    marker("A"),
    blank(),
    paragraph("문단1"),
    blank(),
    marker("B"),
    blank(),
    paragraph("문단2"),
    blank(),
    marker("C"),
  ]);
  // blocks: [A(0), 문단1(1), B(2), 문단2(3), C(4)]

  it("첫 마커 A 를 맨 아래(boundary=blocks.length)로 이동, id 따라감", () => {
    const oldSlots = parseImageMarkers(base);
    const before = descToId(oldSlots);
    const oldIds = oldSlots.map((s) => s.id);
    const blocks = computeBlocks(base);

    const { slots } = applyMoveToBoundary(base, oldIds, 0, blocks.length);
    expect(slots.map((s) => s.description)).toEqual(["B", "C", "A"]);
    expect(descToId(slots)).toEqual(before); // 이미지-마커 연결 보존
    slots.forEach((s, i) => expect(s.index).toBe(i));
  });

  it("마지막 마커 C 를 맨 위(boundary=0)로 이동", () => {
    const oldSlots = parseImageMarkers(base);
    const before = descToId(oldSlots);
    const oldIds = oldSlots.map((s) => s.id);

    const { slots } = applyMoveToBoundary(base, oldIds, 2, 0);
    expect(slots.map((s) => s.description)).toEqual(["C", "A", "B"]);
    expect(descToId(slots)).toEqual(before);
  });

  it("가운데로 이동해도 발행 순서(배열=마커 순서) 유지", () => {
    const oldSlots = parseImageMarkers(base);
    const oldIds = oldSlots.map((s) => s.id);
    // A(index0) 를 문단2 뒤(boundary 4 = C 앞)로
    const { newContent, slots } = applyMoveToBoundary(base, oldIds, 0, 4);
    const markerOrder = (newContent.match(/\[이미지:\s*([^\]]+)\]/g) || []).map((m) =>
      m.replace(/\[이미지:\s*/, "").replace(/\]$/, "").trim()
    );
    expect(slots.map((s) => s.description)).toEqual(markerOrder);
    slots.forEach((s, i) => expect(s.index).toBe(i));
  });
});

describe("위/아래 이동 가능 여부 = 블록 위치 기준(마커 순서 아님)", () => {
  // 버그: 대표컷(첫 마커)을 아래로 내려도 '여전히 첫 마커'라 위로 버튼이 계속 비활성 →
  // 한 번 내리면 다시 못 올림. canMoveUp 을 블록 위치로 판단해야 해결됨.
  const hookBlockIndex = (content: string) => {
    const blocks = computeBlocks(content);
    return blocks.findIndex((b) => b.kind === "marker" && b.markerIndex === 0);
  };

  it("맨 위 블록인 대표컷은 위로 불가(위에 블록 없음)", () => {
    const content = buildContent([marker("HOOK"), blank(), paragraph("도입"), blank(), marker("X")]);
    expect(hookBlockIndex(content)).toBe(0); // canMoveUp = (0 > 0) = false
  });

  it("대표컷을 문단 아래로 내리면 위에 블록이 생겨 다시 위로 이동 가능", () => {
    const content = buildContent([marker("HOOK"), blank(), paragraph("도입"), blank(), marker("X")]);
    const moved = moveMarkerBlock(content, 0, "down").content; // HOOK ↓ (도입 아래로)
    expect(parseImageMarkers(moved)[0].description).toBe("HOOK"); // 여전히 첫 마커(index 0)
    expect(hookBlockIndex(moved)).toBeGreaterThan(0); // 그러나 위에 블록 있음 → canMoveUp = true
  });
});
