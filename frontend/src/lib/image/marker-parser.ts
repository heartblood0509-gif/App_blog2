/**
 * 본문의 [이미지: 설명] 마커를 파싱해서 ImageSlot 배열로 변환.
 *
 * 페어 규칙: 한 마커 다음 줄이 공백뿐이고 그 다음 줄이 바로 또 다른 마커이면
 * 두 마커를 같은 groupId로 묶는다 (예: 전/후 비교, 정면/측면 등).
 *
 * 본문 수정 없이 읽기만 한다. 실제 content에서 마커 제거는 pruneExcludedMarkers.
 */
import type { ImageSlot } from "@/types";

const MARKER_RE = /^\s*\[이미지:\s*(.+?)\]\s*$/;

function randomId(): string {
  // uuid 라이브러리 대신 충분히 고유한 값
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 본문에서 이미지 마커를 추출한다.
 * @param content 원본 마크다운 본문
 */
export function parseImageMarkers(content: string): ImageSlot[] {
  const lines = content.split("\n");
  const rawMarkers: { lineIndex: number; description: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER_RE);
    if (m) {
      rawMarkers.push({ lineIndex: i, description: m[1].trim() });
    }
  }

  const slots: ImageSlot[] = rawMarkers.map((r, idx) => ({
    id: randomId(),
    index: idx,
    description: r.description,
    groupId: null,
    lineIndex: r.lineIndex,
  }));

  // 페어 감지: 연속된 두 마커 사이에 공백 줄만 있으면 같은 그룹
  for (let i = 0; i < slots.length - 1; i++) {
    const a = slots[i];
    const b = slots[i + 1];
    // 이미 그룹에 속해있으면 스킵
    if (a.groupId || b.groupId) continue;
    const between = lines.slice(a.lineIndex + 1, b.lineIndex);
    const allBlank = between.every((l) => l.trim().length === 0);
    if (allBlank && between.length <= 2) {
      const gid = randomId();
      a.groupId = gid;
      a.pairRole = "first";
      b.groupId = gid;
      b.pairRole = "second";
    }
  }

  return slots;
}

/**
 * 제외된 슬롯의 마커 라인을 content에서 제거한다.
 * 마커 앞뒤 공백 줄을 하나씩 흡수하여 빈 줄이 중복되지 않도록 정리한다.
 */
export function pruneExcludedMarkers(
  content: string,
  slots: ImageSlot[],
  excludedSlotIds: Set<string>
): string {
  if (excludedSlotIds.size === 0) return content;

  const excludedLineIndices = new Set(
    slots.filter((s) => excludedSlotIds.has(s.id)).map((s) => s.lineIndex)
  );
  if (excludedLineIndices.size === 0) return content;

  const lines = content.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (excludedLineIndices.has(i)) {
      // 마커 라인 제거. 직전에 빈 줄이 있고 다음 줄도 빈 줄이면 다음 줄도 스킵.
      const prev = kept[kept.length - 1];
      const next = lines[i + 1];
      if (prev !== undefined && prev.trim() === "" && next !== undefined && next.trim() === "") {
        i++; // 뒤쪽 빈 줄 하나 흡수
      }
      continue;
    }
    kept.push(lines[i]);
  }
  return kept.join("\n");
}

/**
 * 모든 소제목(## 로 시작하는 줄) 바로 아래에 [이미지: ...] 마커가 있는지 확인하고,
 * 없으면 자동으로 주입하여 100% 소제목 커버리지를 보장한다.
 *
 * AI(Gemini)가 프롬프트 규칙을 못 지켜 누락한 경우의 안전장치.
 * 주입되는 마커의 description은 소제목 + 직후 본문 첫 문장을 결합해 자동 생성.
 *
 * @param content AI가 생성한 원본 마크다운
 * @returns 소제목 커버리지가 보장된 마크다운 (변경 없으면 원본 그대로)
 */
export function ensureSubtitleCoverage(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    // 소제목(## 또는 ### 로 시작, 선택적 {style} 태그 포함) 감지
    const subtitleMatch = line.match(/^#{2,3}(\{[^}]+\})?\s+(.+)$/);
    if (!subtitleMatch) continue;

    const subtitleText = (subtitleMatch[2] || "").trim();
    if (!subtitleText) continue;

    // 다음 비어있지 않은 줄이 이미 마커인지 확인
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    const nextNonBlank = j < lines.length ? lines[j] : "";

    if (MARKER_RE.test(nextNonBlank)) continue; // 이미 마커 있음, 주입 불필요

    // 누락 → 자동 주입: 빈 줄 + 마커 + 빈 줄
    const bodyPreview = extractBodyPreview(lines, j);
    const description = buildAutoDescription(subtitleText, bodyPreview);
    result.push(""); // 마커 앞 빈 줄
    result.push(`[이미지: ${description}]`);
    result.push(""); // 마커 뒤 빈 줄
  }

  return result.join("\n");
}

/** 소제목 바로 아래 본문의 처음 ~80자 추출 (다음 소제목/마커/해시까지 도달 전에 찾음) */
function extractBodyPreview(lines: string[], startIdx: number): string {
  for (let k = startIdx; k < Math.min(startIdx + 5, lines.length); k++) {
    const t = lines[k].trim();
    if (!t) continue;
    if (/^#{2,3}/.test(t)) break; // 다음 소제목이면 중단
    if (MARKER_RE.test(t)) break; // 마커 만나면 중단
    return t.slice(0, 80);
  }
  return "";
}

/** 자동 마커 description 생성 — 소제목 + 본문 힌트 조합 */
function buildAutoDescription(subtitle: string, bodyPreview: string): string {
  if (bodyPreview) {
    return `${subtitle} 관련 장면 — ${bodyPreview} 분위기, 자연광 실내, 한국인 피사체, 실사 DSLR 사진`;
  }
  return `${subtitle}에 어울리는 실사 감성 장면, 자연광, 한국인 피사체`;
}

/**
 * 주어진 마커의 ±500자 본문 맥락을 추출한다 (image prompt용).
 */
export function extractContextSnippet(
  content: string,
  slotIndex: number,
  windowChars = 500
): string {
  const pattern = /\[이미지:\s*[^\]]+\]/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(content)) !== null) {
    if (i === slotIndex) {
      const start = Math.max(0, match.index - windowChars);
      const end = Math.min(content.length, match.index + match[0].length + windowChars);
      return content.slice(start, end);
    }
    i++;
  }
  return content.slice(0, 1500);
}
