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
  // 단, 최상단 후킹 이미지(index 0)는 페어 대상에서 제외 — 항상 독립 배치
  for (let i = 0; i < slots.length - 1; i++) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a.index === 0) continue;
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
 * AI 응답에서 <HOOK>...</HOOK> 블록을 추출하고, 본문 최상단에 [이미지: …] 마커로 변환해 prepend한다.
 *
 * 결정론적 파싱 — AI가 어떻게 쓰든 HOOK 블록만 있으면 100% 맨 위로 고정.
 * HOOK 블록이 없으면(AI가 누락) fallback description으로 주입 (안전장치).
 *
 * @param rawContent AI의 전체 응답 (<HOOK>...</HOOK> + 본문 마크다운)
 * @param title  선택된 제목 (fallback 생성용)
 * @param mainKeyword 메인 키워드 (fallback 생성용)
 * @returns 최상단에 [이미지: ...] 마커가 고정된 깔끔한 본문 마크다운
 */
export function extractHookAndBody(
  rawContent: string,
  title: string,
  mainKeyword: string
): string {
  if (!rawContent) return rawContent;

  const hasOpenTag = /<HOOK>/i.test(rawContent);
  const hasCloseTag = /<\/HOOK>/i.test(rawContent);

  // 스트리밍 중 <HOOK> 열린 태그만 도착한 상태 → 완전히 닫힐 때까지 처리 보류
  if (hasOpenTag && !hasCloseTag) {
    return rawContent;
  }

  // 완전한 <HOOK>...</HOOK> 블록이 있으면 추출 후 본문 맨 앞에 prepend (결정론적)
  const hookMatch = rawContent.match(/<HOOK>\s*([\s\S]*?)\s*<\/HOOK>/i);
  if (hookMatch) {
    const hookDescription = sanitizeHookDescription(hookMatch[1].trim());
    const body = rawContent.replace(/<HOOK>[\s\S]*?<\/HOOK>\s*/i, "").trimStart();
    if (!hookDescription) {
      // HOOK 블록은 있는데 내용이 비어있음 → fallback으로 대체
      const fallback = buildFallbackHookDescription(title, mainKeyword);
      return `[이미지: ${fallback}]\n\n${body}`;
    }
    return `[이미지: ${hookDescription}]\n\n${body}`;
  }

  // HOOK 태그 자체가 없는 경우 (AI 누락 or 이미 처리됨 재호출)
  const body = rawContent.trimStart();
  const lines = body.split("\n");
  let firstIdx = 0;
  while (firstIdx < lines.length && lines[firstIdx].trim() === "") firstIdx++;
  if (firstIdx < lines.length && MARKER_RE.test(lines[firstIdx])) {
    // 첫 줄이 이미 [이미지: …] 마커 → 중복 주입 방지
    return body;
  }

  // AI가 HOOK 블록을 빠뜨렸고 본문 맨 앞에 마커도 없음 → fallback 주입
  const fallback = buildFallbackHookDescription(title, mainKeyword);
  return `[이미지: ${fallback}]\n\n${body}`;
}

/** AI가 묘사에 [이미지:] 대괄호를 잘못 포함한 경우 내부 텍스트만 추출 */
function sanitizeHookDescription(desc: string): string {
  const bracketMatch = desc.match(/^\[이미지:\s*(.+?)\]\s*$/);
  if (bracketMatch) return bracketMatch[1].trim();
  return desc;
}

/** AI가 HOOK 블록 자체를 누락했을 때만 사용하는 fallback description */
function buildFallbackHookDescription(title: string, mainKeyword: string): string {
  const t = (title || "").trim();
  const k = (mainKeyword || "").trim();
  if (t && k) {
    return `${t} 분위기를 상징하는 대표 장면, ${k} 맥락의 감정 유발 컷, 자연광 실내, 한국인 피사체, 실사 DSLR`;
  }
  if (t) {
    return `${t} 분위기를 상징하는 대표 장면, 자연광 실내, 한국인 피사체, 실사 DSLR`;
  }
  if (k) {
    return `${k} 맥락을 보여주는 감정 유발 대표 컷, 자연광 실내, 한국인 피사체, 실사 DSLR`;
  }
  return "글의 분위기를 상징하는 감성 대표 장면, 자연광 실내, 한국인 피사체, 실사 DSLR";
}

/**
 * AI가 가끔 만드는 HTML `<br>` 태그를 줄바꿈으로 치환.
 * 미리보기에서 `<br>`가 텍스트로 노출되는 표시 불일치를 제거.
 * 발행 측은 markdown_converter가 동일하게 처리하므로 미리보기/발행 일치.
 */
export function stripBrTags(content: string): string {
  if (!content) return content;
  return content.replace(/<br\s*\/?>/gi, "\n");
}

/**
 * @deprecated extractHookAndBody로 교체됨. 하위 호환을 위해 유지.
 * 내부적으로 extractHookAndBody를 호출.
 */
export function ensureHookImage(
  content: string,
  title: string,
  mainKeyword: string
): string {
  return extractHookAndBody(content, title, mainKeyword);
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
 * 소제목(##) 바로 앞에 같은 문장이 일반 텍스트로 중복 등장하면 앞줄을 제거한다.
 *
 * AI가 본문에 문장을 한 번 쓰고 그 다음 줄에 ## 로 또 쓰는 패턴 방어.
 * 네이버 발행 시 ##가 인용구로 변환되면서 같은 문장이 두 번 나오는 현상을 막는다.
 *
 * 규칙:
 * - 각 소제목 줄마다 앞쪽 가장 가까운 비공백 줄을 검사
 * - 앞줄이 이미지 마커 / 다른 소제목이면 건너뜀
 * - 정규화(공백 정리) 후 완전 일치하면 앞줄 삭제
 * - 어미 차이·부분 일치는 보존 (보수적 제거)
 */
export function dedupeSubtitleEchoes(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const toDelete = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{2,3}(\{[^}]+\})?\s+(.+)$/);
    if (!m) continue;
    const subtitleText = normalizeForDedupe(m[2] || "");
    if (!subtitleText) continue;

    // 앞쪽 비공백 줄 찾기
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    if (j < 0) continue;

    const prevTrim = lines[j].trim();
    if (MARKER_RE.test(prevTrim)) continue;
    if (/^#{2,3}/.test(prevTrim)) continue;

    if (normalizeForDedupe(prevTrim) === subtitleText) {
      toDelete.add(j);
    }
  }

  if (toDelete.size === 0) return content;

  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (toDelete.has(i)) {
      // 앞뒤 빈 줄 중복 방지: 앞이 빈 줄이고 다음도 빈 줄이면 뒤 빈 줄 하나 흡수
      const prev = kept[kept.length - 1];
      const next = lines[i + 1];
      if (
        prev !== undefined &&
        prev.trim() === "" &&
        next !== undefined &&
        next.trim() === ""
      ) {
        i++;
      }
      continue;
    }
    kept.push(lines[i]);
  }
  return kept.join("\n");
}

function normalizeForDedupe(s: string): string {
  return s.replace(/\s+/g, " ").trim();
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
