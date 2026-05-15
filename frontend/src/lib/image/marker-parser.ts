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
 * 본문 맨 위 훅 이미지 마커 바로 다음(공백 줄 스킵)이 소제목(##/###) 또는
 * 명시 인용구(>스타일>)로 시작하는 경우, 도입부 본문이 0줄이라는 뜻이므로
 * 훅 이미지 마커를 제거한다.
 *
 * 강제로 박힌 훅 이미지와 소제목/인용구용 이미지가 거의 붙어 어색해지는 케이스 보정.
 * 발행 봇은 슬롯 순서대로 처리하므로 훅 제거 후엔 다음 이미지가 자동으로 첫 슬롯이 된다.
 */
export function pruneEmptyIntroHook(content: string): string {
  if (!content) return content;
  const lines = content.split("\n");

  let firstIdx = 0;
  while (firstIdx < lines.length && lines[firstIdx].trim() === "") firstIdx++;
  if (firstIdx >= lines.length) return content;
  if (!MARKER_RE.test(lines[firstIdx])) return content;

  let nextIdx = firstIdx + 1;
  while (nextIdx < lines.length && lines[nextIdx].trim() === "") nextIdx++;
  if (nextIdx >= lines.length) return content;

  const SUBTITLE_RE = /^#{2,3}(\{[^}]+\})?\s+(.+)$/;
  const QUOTE_RE = /^>\w+>\s+/;
  if (SUBTITLE_RE.test(lines[nextIdx]) || QUOTE_RE.test(lines[nextIdx])) {
    return lines.slice(nextIdx).join("\n");
  }
  return content;
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

/**
 * HOOK과 첫 ## 소제목 사이 도입부가 길고 마커가 부족하면 자동 주입.
 *
 * AI가 도입부를 1개의 큰 섹션으로 처리해서 마커를 안 박는 경우의 안전장치.
 * 함정 폭로형 같은 글에서 HOOK 다음 자기 고백·사명감 단락이 길게 이어질 때
 * 텍스트만 8~10단락 노출되어 가독성이 떨어지는 사고를 방지한다.
 *
 * 규칙:
 * - 첫 ##/### 소제목 직전까지를 "도입부"로 간주
 * - 도입부 본문(마커 제외)이 600자 미만이면 패스
 * - 도입부에 마커가 2개 이상 이미 있으면 패스 (HOOK 마커 + 다른 마커)
 * - 600자 이상 + 마커 ≤ 1 → 자동 주입 (HOOK 마커 다음 빈 줄들 중 ~60% 지점)
 *
 * @param content AI 출력 (ensureHookImage / dedupeSubtitleEchoes 직후)
 * @param mainKeyword 주입 마커 description에 활용
 * @returns 도입부 마커가 보장된 마크다운 (변경 없으면 원본 그대로)
 */
export function ensureIntroImage(content: string, mainKeyword: string): string {
  if (!content) return content;

  const lines = content.split("\n");

  // 1. 첫 ##/### 소제목 인덱스 찾기
  let firstHeadingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}(\{[^}]+\})?\s+/.test(lines[i])) {
      firstHeadingIdx = i;
      break;
    }
  }
  if (firstHeadingIdx === -1) return content; // 소제목 없으면 도입부 개념 없음

  const introLines = lines.slice(0, firstHeadingIdx);

  // 2. 도입부 마커 개수 (HOOK 마커 1개는 허용 — 그 외 추가 마커 있으면 이미 충분)
  let markerCount = 0;
  let firstMarkerIdx = -1;
  for (let i = 0; i < introLines.length; i++) {
    if (MARKER_RE.test(introLines[i])) {
      markerCount++;
      if (firstMarkerIdx === -1) firstMarkerIdx = i;
    }
  }
  if (markerCount >= 2) return content; // 이미 도입부 마커 있음

  // 3. 도입부 본문 길이 측정 (마커·HOOK 태그 줄 제외)
  let bodyLength = 0;
  for (const line of introLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (MARKER_RE.test(trimmed)) continue;
    if (trimmed.startsWith("<HOOK>") || trimmed.includes("</HOOK>")) continue;
    bodyLength += trimmed.length;
  }
  if (bodyLength < 600) return content; // 짧은 도입부는 마커 불필요

  // 4. 주입 위치 후보 — HOOK 마커 이후의 빈 줄들
  const startSearchIdx = firstMarkerIdx === -1 ? 0 : firstMarkerIdx + 2;
  const blankIndices: number[] = [];
  for (let i = startSearchIdx; i < introLines.length; i++) {
    if (introLines[i].trim() === "") blankIndices.push(i);
  }
  if (blankIndices.length < 1) return content; // 빈 줄 없으면 박을 자리 애매

  // 5. ~60% 지점 빈 줄 선택 (자기 고백·사명감 단락이 보통 도입부 후반에 위치)
  const targetIdx = blankIndices[Math.floor(blankIndices.length * 0.6)];

  // 6. 마커 description 생성
  const description = `${mainKeyword || "도입부"} 관련 감정 전환 장면, 자연광 실내, 한국인 피사체, 실사 DSLR 사진`;

  // 7. 주입 (target 빈 줄 다음 줄에 마커, 추가 빈 줄 1개)
  const result = [...lines];
  result.splice(targetIdx + 1, 0, `[이미지: ${description}]`, "");

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

// ─────────────────────────────────────────────────────────────────────────────
// 브랜드 블로그 전용 (postCategory === "brand")
//
// 후기성 블로그(review)와 다른 이미지 배치 규칙을 적용한다.
// 후기성 동작 보존을 위해 기존 함수와 분리. 호출은 app/page.tsx에서 분기.
//
// 규칙 요약:
//   R2. 소제목 아래 이미지 — 단, 소제목 바로 다음에 열거가 시작되면 생략
//   R3. 본문 추가 이미지 — 직전 이미지 3문단↑ + 다음 이미지 2문단↑ 남았을 때만
//   R4. 열거(첫째/둘째/…) 3개↑ — 각 항목 바로 위에 이미지
//   R5. 도입부 이미지 — 본문 3문단↑ 일 때만 중간에 1장
//   R6. 본문 살균 — AI가 흘린 프롬프트 메타 텍스트 제거
// ─────────────────────────────────────────────────────────────────────────────

/** 한국어 서수형 열거 마커 (첫째, 둘째, …, 열째) */
const KO_ORDINAL_RE = /^(첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째|여덟째|아홉째|열째)\s*[,.\s]/;

/** 숫자 열거 마커 (1. 또는 1)) — 줄 시작 */
const NUM_ORDINAL_RE = /^\d+[.)]\s+\S/;

/** 이 줄이 열거 항목의 시작인가? */
function isEnumerationItemLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (KO_ORDINAL_RE.test(t)) return true;
  if (NUM_ORDINAL_RE.test(t)) return true;
  return false;
}

/** 소제목/이미지마커/HOOK 태그 줄을 제외한 일반 본문 줄인가? */
function isBodyTextLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (MARKER_RE.test(t)) return false;
  if (/^#{1,6}(\{[^}]+\})?\s+/.test(t)) return false;
  if (/^<\/?HOOK>/i.test(t)) return false;
  return true;
}

/**
 * R6. 본문에 새어 나온 프롬프트 메타 텍스트를 제거한다.
 *
 * AI가 가끔 시스템 프롬프트의 일부 (이미지 배치 규칙 섹션 등) 를 본문에
 * 그대로 출력해버리는 사고를 막는다. 보수적으로 — 명백한 메타 패턴만 제거.
 */
export function sanitizeBrandBodyText(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const result: string[] = [];

  // 메타 블록 진입 감지: "검산 체크리스트" 같은 키워드를 만나면 다음 빈 줄까지 통째로 제거
  const META_BLOCK_TRIGGERS = [
    /^#{1,6}\s*이미지\s*배치/,
    /^\[이미지\s*배치\s*[—\-]/,
    /^검산\s*체크리스트/,
    /^\d단계\s*[—\-]\s*소제목\s*커버리지/,
    /^\d단계\s*[—\-]\s*도입부\s*커버리지/,
    /^\d단계\s*[—\-]\s*잔여\s*분산/,
    /^\d단계\s*[—\-]\s*마커\s*작성/,
  ];

  let skipUntilBlank = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (skipUntilBlank) {
      if (trimmed === "") skipUntilBlank = false;
      continue;
    }

    if (META_BLOCK_TRIGGERS.some((re) => re.test(trimmed))) {
      skipUntilBlank = true;
      continue;
    }

    // 단일 줄 메타 — 자주 새는 패턴들
    if (/^(자연스러움보다\s*우선|예외\s*없음\s*[—\-])/.test(trimmed)) continue;
    if (/^[\-·]\s*(좋은|나쁜)\s*예\s*[:：]/.test(trimmed)) continue;

    // 마커 안에 마커 (`[이미지: [이미지: ...]]`) → 안쪽 정리
    if (trimmed.startsWith("[이미지:")) {
      const fixed = line.replace(/\[이미지:\s*\[이미지:\s*/g, "[이미지: ");
      result.push(fixed);
      continue;
    }

    // 마커가 닫히지 않음 (`[이미지: 묘사` — 같은 줄에 `]` 없음) → 닫음
    if (/^\s*\[이미지:[^\]]*$/.test(line)) {
      result.push(line + "]");
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * R4. 본문에 열거(첫째/둘째/셋째 또는 1./2./3.) 항목이 3개 이상 등장하는
 * 섹션을 찾아, 각 항목 바로 위에 [이미지: …] 마커를 주입한다.
 *
 * 섹션 = 두 ##/### 소제목 사이 (또는 문서 시작/끝). 한 섹션 안에 항목이
 * 3개 이상이어야 적용 — 1~2개짜리 단발 항목은 일반 본문으로 취급.
 */
export function ensureBrandEnumerationImages(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");

  // 섹션별로 열거 항목 인덱스 모으기
  const sections: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}(\{[^}]+\})?\s+/.test(lines[i])) {
      if (current.length >= 3) sections.push(current);
      current = [];
      continue;
    }
    if (isEnumerationItemLine(lines[i])) current.push(i);
  }
  if (current.length >= 3) sections.push(current);

  if (sections.length === 0) return content;

  // 주입할 인덱스 모아두고 한 번에 처리 (역순 삽입)
  const injectAtLine = new Set<number>();
  for (const section of sections) {
    for (const idx of section) {
      // 이미 바로 위에 마커 있으면 건너뜀
      let p = idx - 1;
      while (p >= 0 && lines[p].trim() === "") p--;
      if (p >= 0 && MARKER_RE.test(lines[p])) continue;
      injectAtLine.add(idx);
    }
  }

  if (injectAtLine.size === 0) return content;

  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (injectAtLine.has(i)) {
      const itemPreview = lines[i].trim().slice(0, 60);
      const description = `${itemPreview} 관련 장면, 자연광 실내, 한국인 피사체, 실사 DSLR 사진`;
      // 직전 줄이 빈 줄이 아니면 빈 줄 하나 추가
      if (result.length > 0 && result[result.length - 1].trim() !== "") {
        result.push("");
      }
      result.push(`[이미지: ${description}]`);
      result.push("");
    }
    result.push(lines[i]);
  }
  return result.join("\n");
}

/**
 * R2 (브랜드용). 모든 ##/### 소제목 바로 아래에 이미지 마커를 주입.
 * 단, 다음 비공백 줄이 이미 마커이거나 열거 항목이면 생략.
 *
 * 보통은 ensureBrandEnumerationImages를 먼저 돌려서 열거 위에 마커가
 * 박혀있는 상태이므로, 자연스럽게 "마커 있음 → 생략" 으로 처리된다.
 */
export function ensureBrandSubtitleCoverage(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    const subtitleMatch = line.match(/^#{2,3}(\{[^}]+\})?\s+(.+)$/);
    if (!subtitleMatch) continue;

    const subtitleText = (subtitleMatch[2] || "").trim();
    if (!subtitleText) continue;

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    const nextNonBlank = j < lines.length ? lines[j] : "";

    if (MARKER_RE.test(nextNonBlank)) continue;
    if (isEnumerationItemLine(nextNonBlank)) continue; // R2 예외 — 열거 시작이면 생략

    const bodyPreview = extractBodyPreview(lines, j);
    const description = buildAutoDescription(subtitleText, bodyPreview);
    result.push("");
    result.push(`[이미지: ${description}]`);
    result.push("");
  }

  return result.join("\n");
}

/**
 * R5 (브랜드용). HOOK과 첫 ##/### 소제목 사이 도입부에 본문 문단이
 * 3개 이상 있으면 중간에 마커 1장 자동 주입.
 *
 * 단, 도입부에 이미 마커가 2개 이상 있거나 (HOOK + 다른 마커) 본문 문단이
 * 3개 미만이면 패스.
 */
export function ensureBrandIntroImage(content: string, mainKeyword: string): string {
  if (!content) return content;

  const lines = content.split("\n");

  let firstHeadingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}(\{[^}]+\})?\s+/.test(lines[i])) {
      firstHeadingIdx = i;
      break;
    }
  }
  if (firstHeadingIdx === -1) return content;

  const introLines = lines.slice(0, firstHeadingIdx);

  let markerCount = 0;
  let firstMarkerIdx = -1;
  for (let i = 0; i < introLines.length; i++) {
    if (MARKER_RE.test(introLines[i])) {
      markerCount++;
      if (firstMarkerIdx === -1) firstMarkerIdx = i;
    }
  }
  if (markerCount >= 2) return content;

  // 도입부 본문 문단 수 세기 (마커·HOOK·빈 줄 제외, 연속 본문 줄을 1문단으로)
  const paragraphRanges: { start: number; end: number }[] = [];
  let curStart = -1;
  for (let i = 0; i < introLines.length; i++) {
    if (isBodyTextLine(introLines[i])) {
      if (curStart === -1) curStart = i;
    } else {
      if (curStart !== -1) {
        paragraphRanges.push({ start: curStart, end: i - 1 });
        curStart = -1;
      }
    }
  }
  if (curStart !== -1) paragraphRanges.push({ start: curStart, end: introLines.length - 1 });

  if (paragraphRanges.length < 3) return content;

  // 중간 문단 직후에 주입 (예: 4문단이면 2번째 문단 끝 다음, 5문단이면 3번째 문단 끝 다음)
  const targetParagraphIdx = Math.floor(paragraphRanges.length / 2);
  const targetLine = paragraphRanges[targetParagraphIdx].end;

  const description = `${mainKeyword || "도입부"} 관련 감정 전환 장면, 자연광 실내, 한국인 피사체, 실사 DSLR 사진`;

  const result = [...lines];
  result.splice(targetLine + 1, 0, "", `[이미지: ${description}]`, "");

  return result.join("\n");
}

/**
 * R3 (브랜드용). 직전 이미지에서 본문 3문단↑ 쌓이고 다음 이미지까지 본문
 * 2문단↑ 남았을 때만 그 사이에 1장 자동 추가.
 *
 * "끝부분에 다닥다닥" 사고 방지: 곧 다음 소제목/열거 이미지가 나올 자리면
 * 채움 이미지를 박지 않는다.
 */
export function ensureBrandBodyFillerImages(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");

  // 1) "본문 문단" 단위로 변환 — 각 문단의 시작/끝 라인 인덱스
  const blocks: { kind: "text" | "marker" | "heading" | "hook"; startLine: number; endLine: number }[] = [];
  let curKind: "text" | null = null;
  let curStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "") {
      if (curKind === "text") {
        blocks.push({ kind: "text", startLine: curStart, endLine: i - 1 });
        curKind = null;
        curStart = -1;
      }
      continue;
    }
    if (MARKER_RE.test(t)) {
      if (curKind === "text") {
        blocks.push({ kind: "text", startLine: curStart, endLine: i - 1 });
        curKind = null;
        curStart = -1;
      }
      blocks.push({ kind: "marker", startLine: i, endLine: i });
      continue;
    }
    if (/^#{1,6}(\{[^}]+\})?\s+/.test(t)) {
      if (curKind === "text") {
        blocks.push({ kind: "text", startLine: curStart, endLine: i - 1 });
        curKind = null;
        curStart = -1;
      }
      blocks.push({ kind: "heading", startLine: i, endLine: i });
      continue;
    }
    if (/^<\/?HOOK>/i.test(t)) {
      if (curKind === "text") {
        blocks.push({ kind: "text", startLine: curStart, endLine: i - 1 });
        curKind = null;
        curStart = -1;
      }
      blocks.push({ kind: "hook", startLine: i, endLine: i });
      continue;
    }
    // 본문 텍스트
    if (curKind !== "text") {
      curKind = "text";
      curStart = i;
    }
  }
  if (curKind === "text") {
    blocks.push({ kind: "text", startLine: curStart, endLine: lines.length - 1 });
  }

  // 2) 마커 사이 텍스트 문단 갭을 분석
  // 마커 위치 인덱스(blocks 안의)
  const markerBlockIdx: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === "marker") markerBlockIdx.push(i);
  }
  if (markerBlockIdx.length === 0) return content; // 마커가 하나도 없으면 채움 의미 없음

  // 각 마커 사이 (또는 마지막 마커 → 문서 끝) 텍스트 문단 수와 그 위치 수집
  const insertAfterLine: { line: number; description: string }[] = [];

  for (let m = 0; m < markerBlockIdx.length; m++) {
    const startBlock = markerBlockIdx[m];
    const endBlock = m + 1 < markerBlockIdx.length ? markerBlockIdx[m + 1] : blocks.length;

    // 갭 사이에 있는 텍스트 문단들만 추출
    const textBlocks = blocks.slice(startBlock + 1, endBlock).filter((b) => b.kind === "text");
    if (textBlocks.length < 5) continue; // 3 + 2 = 최소 5문단 필요

    // 3번째 문단 끝 다음에 삽입 (그러면 left=3, right=textBlocks.length-3 ≥ 2)
    const target = textBlocks[2];
    const previewLine = lines[target.startLine].trim();
    const description = `${previewLine.slice(0, 60)} 관련 장면, 자연광 실내, 한국인 피사체, 실사 DSLR 사진`;
    insertAfterLine.push({ line: target.endLine, description });
  }

  if (insertAfterLine.length === 0) return content;

  // 역순으로 라인 삽입 (인덱스 안 깨짐)
  const result = [...lines];
  for (let k = insertAfterLine.length - 1; k >= 0; k--) {
    const { line, description } = insertAfterLine[k];
    result.splice(line + 1, 0, "", `[이미지: ${description}]`, "");
  }

  return result.join("\n");
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
