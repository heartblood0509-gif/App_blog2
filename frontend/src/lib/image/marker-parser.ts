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
 * 연속된 빈 줄(3개 이상)을 1개로 압축한다.
 *
 * AI(Gemini)가 가끔 본문 중간에 `<br>` 태그를 수십~수백 개 쏟아내는 사고가 있다.
 * stripBrTags가 모두 `\n`으로 치환하면 빈 줄이 거대하게 누적되어 미리보기에
 * 수천 픽셀의 빈 공간으로 나타난다.
 *
 * 일반 문단 간격(빈 줄 1개)과 마커 앞뒤 빈 줄은 그대로 보존되며,
 * 사고성 빈 줄 폭주만 안전하게 1개로 압축한다. 본문 텍스트는 손대지 않는다.
 */
export function collapseBlankLines(content: string): string {
  if (!content) return content;
  // 3개 이상 연속 개행(\n\n\n+) → 빈 줄 1개(\n\n)
  return content.replace(/\n{3,}/g, "\n\n");
}

/**
 * 소제목 콤마 뒤 자동 줄바꿈.
 *
 * AI가 만든 소제목이 콤마 포함 긴 문장일 때
 * (예: "더 이상 속지 마세요, 당신의 현명한 선택을 응원합니다."),
 * 미리보기와 네이버 인용구 양쪽 모두 한 줄로 길게 표시되어 가독성이 떨어진다.
 * 콤마 뒤에 \n을 삽입해 두 줄로 표시되게 한다.
 *
 * 발행봇은 인용구 위젯의 span.textContent 에 텍스트를 통째 주입하는데
 * (backend/bots/naver_blog_publisher.py _try_quotation_widget),
 * 네이버 SmartEditor 인용구 span 의 CSS 가 \n 을 시각적 줄바꿈으로 렌더한다
 * (1회용 검증 스크립트 backend/verify_quote_linebreak.py 로 실증 완료).
 * 미리보기 측은 BlogContentRenderer 의 소제목 <p> 에 whitespace-pre-wrap
 * 클래스가 붙어 있어 동일하게 표시된다.
 *
 * 조건 (글 퀄리티 보호 — 짧은 소제목·콤마 없는 소제목은 무변경):
 *  1. 소제목 본문 길이 ≥ 25자
 *  2. 콤마(,) 포함
 *  3. 첫 콤마 뒤 텍스트 길이(trim) ≥ 5자
 *
 * 본문 일반 텍스트는 손대지 않는다 (정규식이 `^##` 라인만 매칭).
 * `##{postit}`, `##{underline}` 같은 스타일 마커도 보존된다.
 */
export function applySubtitleLineBreaks(content: string): string {
  if (!content) return content;
  return content.replace(
    /^(#{2,3})(\{[^}]+\})?(\s+)(.+)$/gm,
    (full, hashes, styleMarker, space, body) => {
      const text = body as string;
      if (text.length < 25) return full;
      const commaIdx = text.indexOf(",");
      if (commaIdx === -1) return full;
      // ★ idempotency 보장 — page.tsx 의 useEffect 가 후처리 결과를 다시
      // state 에 넣고 useEffect 가 재실행되는 패턴이라 함수가 두 번 호출돼도
      // 같은 결과여야 한다. 콤마 바로 뒤가 이미 [[BR]] 이면 처리 완료 → skip.
      const rest = text.slice(commaIdx + 1);
      if (rest.startsWith("[[BR]]")) return full;
      const after = rest.trimStart();
      if (after.length < 5) return full;
      const before = text.slice(0, commaIdx + 1);
      // \n 대신 [[BR]] sentinel 사용 — content.split("\n") 에 안 잘려서
      // 소제목 라인이 한 줄로 유지됨. 미리보기/발행봇 진입점에서 \n 으로 치환.
      return `${hashes}${styleMarker ?? ""}${space}${before}[[BR]]${after}`;
    },
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// 이미지 마커 총량 상한 (캡) — 마지막 안전장치
//
// AI + 후처리 ensure 함수가 누적 박는 구조에서 한 글의 마커가 폭증하는 사고를
// 막기 위한 최종 컷. 사용자 범위: 후기성·브랜드 8~12장 / AEO 4~8장.
//
// 보존 규칙 (절대 컷 대상 아님):
//   - HOOK (첫 마커 — pruneEmptyIntroHook 이전에 호출되어야 의미가 있음)
//   - 소제목 직후 마커 (## 또는 ##{style} 다음 빈 줄만 두고 등장하는 마커)
//   - 페어 그룹 (groupId): 한쪽이 보존이면 짝도 보존
//
// 컷 알고리즘:
//   - 후보 = 전체 - 보존
//   - 전체 슬롯의 lineIndex 범위 [first, last]를 (K+1) 등분
//   - 각 분할 지점에 가장 가까운 후보 선택 (보존은 가상 점유로만 작용)
//   - 페어 한쪽 컷 시 짝도 동반 컷 → 결과가 maxCount보다 1~2장 적을 수 있음 (의도)
//
// 회귀 보호:
//   - 보존 슬롯만으로 이미 maxCount 초과 → no-op (소제목 보존 최우선)
//   - K ≤ 0 또는 후보 0개 → no-op
// ─────────────────────────────────────────────────────────────────────────────
const SUBTITLE_LINE_RE = /^#{2,3}(\{[^}]+\})?\s+.+$/;

/**
 * 한 글의 이미지 마커 수를 maxCount 이하로 강제로 제한한다.
 *
 * @param content 현재 본문 마크다운 (ensure 함수들 다 돈 직후 상태)
 * @param maxCount 허용 상한 (후기성·브랜드 12, AEO 8)
 * @param options.hardCap true면 보호 슬롯이 maxCount 초과할 때도 강제로 컷 (lineIndex 가장 빠른 maxCount개만 유지).
 *                        기본 false — 기존 동작(보호 우선, 컷 포기) 보존.
 *                        seoAeo Intent 모드(3~4장 미니멀 정책)처럼 보호 슬롯이 maxCount보다 많아질 때 사용.
 * @returns 컷이 반영된 본문 (변경 없으면 원본 그대로)
 */
export function enforceImageMarkerCap(
  content: string,
  maxCount: number,
  options?: { hardCap?: boolean },
): string {
  if (!content) return content;

  const hardCap = options?.hardCap ?? false;

  const slots = parseImageMarkers(content);
  if (slots.length <= maxCount) return content;

  const lines = content.split("\n");

  // 보존 슬롯 분류
  const protectedIds = new Set<string>();

  // HOOK = 첫 슬롯 (호출 시점이 pruneEmptyIntroHook 이전이라 안전)
  if (slots.length > 0) protectedIds.add(slots[0].id);

  // 소제목 직후 마커: 슬롯 lineIndex 이전의 가장 가까운 비공백 줄이 ##/### 인지
  for (const slot of slots) {
    let j = slot.lineIndex - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    if (j >= 0 && SUBTITLE_LINE_RE.test(lines[j])) {
      protectedIds.add(slot.id);
    }
  }

  // 페어 동반 보존: groupId가 있고 한쪽이 보존이면 짝도 보존
  const byGroup = new Map<string, string[]>();
  for (const slot of slots) {
    if (!slot.groupId) continue;
    if (!byGroup.has(slot.groupId)) byGroup.set(slot.groupId, []);
    byGroup.get(slot.groupId)!.push(slot.id);
  }
  for (const ids of byGroup.values()) {
    if (ids.some((id) => protectedIds.has(id))) {
      ids.forEach((id) => protectedIds.add(id));
    }
  }

  // 보존만으로 이미 maxCount 초과
  // - hardCap=false (기본): 소제목 보존 최우선, 강제 컷 없음 (기존 동작 그대로)
  // - hardCap=true: 보호 슬롯 중에서도 lineIndex 가장 빠른 maxCount 개만 유지하고 나머지 컷
  if (protectedIds.size >= maxCount) {
    if (!hardCap) return content;

    const sortedProtected = [...protectedIds]
      .map((id) => slots.find((s) => s.id === id))
      .filter((s): s is ImageSlot => Boolean(s))
      .sort((a, b) => a.lineIndex - b.lineIndex);

    const keepIds = new Set(sortedProtected.slice(0, maxCount).map((s) => s.id));
    const cutIds = new Set(slots.map((s) => s.id).filter((id) => !keepIds.has(id)));

    return pruneExcludedMarkers(content, slots, cutIds);
  }

  // 후보 풀
  const candidates = slots.filter((s) => !protectedIds.has(s.id));
  if (candidates.length === 0) return content;

  // 잘라낼 갯수
  const K = slots.length - maxCount;
  if (K <= 0) return content;

  // 전역 lineIndex 균등 컷: 전체 슬롯 [first, last] 범위를 (K+1) 등분
  const first = slots[0].lineIndex;
  const last = slots[slots.length - 1].lineIndex;
  const range = Math.max(1, last - first);

  const targetLineIndices: number[] = [];
  for (let i = 1; i <= K; i++) {
    targetLineIndices.push(first + Math.round((range * i) / (K + 1)));
  }

  // 각 target에 가장 가까운 후보 선택 (이미 선택된 후보 제외)
  const selectedIds = new Set<string>();
  const usedCandidateIds = new Set<string>();
  for (const target of targetLineIndices) {
    let bestCandidate: ImageSlot | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      if (usedCandidateIds.has(c.id)) continue;
      const dist = Math.abs(c.lineIndex - target);
      if (dist < bestDist) {
        bestDist = dist;
        bestCandidate = c;
      }
    }
    if (bestCandidate) {
      usedCandidateIds.add(bestCandidate.id);
      selectedIds.add(bestCandidate.id);
    }
  }

  // 페어 동반 컷: 선택된 후보가 페어 한쪽이면 짝도 컷
  for (const id of [...selectedIds]) {
    const slot = slots.find((s) => s.id === id);
    if (!slot || !slot.groupId) continue;
    const groupIds = byGroup.get(slot.groupId);
    if (!groupIds) continue;
    groupIds.forEach((gid) => selectedIds.add(gid));
  }

  return pruneExcludedMarkers(content, slots, selectedIds);
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

/**
 * AI 변환(피사체 식별) 프리패스용 본문 맥락 추출.
 *
 * ±500자 윈도우(extractContextSnippet)와 달리 **글 전체**를 근거로 준다.
 * 이유(구글 공식 가이드): 단일 질문("이 사진이 뭐냐")에 대해 한 가지 주제로 쓰인
 * 글 전체는 일관된 근거가 되며(Add context), 단일 추출은 정확도가 높다.
 * 이미지 마커([이미지: …])는 모두 제거한다 — 다른 사진 설명은 다중 피사체 노이즈가 되고,
 * 위치 표식은 식별 정확도를 올린다는 공식 근거가 없어 단순화를 위해 쓰지 않는다.
 *
 * @param content   본문 마크다운 전체
 * @param maxChars  안전 상한(폭주 방지). 초과 시 앞에서부터 컷. 기본 8000.
 * @returns 모든 이미지 마커가 제거된 본문(맥락 근거용)
 */
export function extractIdentificationContext(
  content: string,
  maxChars = 8000
): string {
  if (!content) return "";
  const cleaned = content
    .replace(/\[이미지:\s*[^\]]+\]/g, "") // 모든 마커 제거
    .replace(/\n{3,}/g, "\n\n") // 빈 줄 폭주 정리
    .trim();
  return cleaned.length <= maxChars ? cleaned : cleaned.slice(0, maxChars);
}
