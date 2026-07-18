/**
 * 본문 + 이미지를 ZIP 한 묶음으로 내보낸다.
 *
 * 구성 (모든 파일이 한 폴더에 평평하게 — 이미지 하위폴더 없음):
 *   글제목/
 *     본문.txt          ← 마커에 번호 + 정확한 파일명을 표기 (메모장에서 한눈에 매칭)
 *     본문.md           ← 이미지 있는 마커는 ![설명](NN_설명.ext)로 치환 (뷰어에서 인라인 표시)
 *     01_설명.jpg        ← 본문 파일과 같은 폴더에 나란히
 *     02_설명.png
 *
 * 본문.txt 마커 예:
 *   [이미지 01] 👉 "01_거울앞에서머리카락을.jpg"  —  거울 앞에서 머리카락을 보며 걱정하는 표정
 *
 * 설계 메모:
 *  - generatedImages 는 base64 문자열만 있고 mimeType 이 없으므로(page.tsx), 확장자는
 *    base64 매직바이트로 판별한다. draft 내보내기처럼 mimeType 을 알면 그걸 우선 사용.
 *  - 번호(NN)는 슬롯 등장 순서(1-base)로 고정한다. 이미지가 없는 슬롯도 번호는 소비되어
 *    (.txt/.md/이미지 파일이 같은 번호 체계를 공유) 어긋나지 않는다.
 *  - 다운로드는 Blob + <a download>. Electron 은 will-download 핸들러가 저장 위치 선택 창을 띄움(기본 위치=다운로드 폴더).
 */

import JSZip from "jszip";
import type { ImageSlot } from "@/types";
// triggerDownload 는 download.ts 로 이동(경량 분리). 기존 import 경로 호환 위해 re-export.
import { triggerDownload } from "./download";
export { triggerDownload };

export interface ExportZipInput {
  title: string;
  content: string;
  imageSlots: ImageSlot[];
  /** slotId → base64 (data URL prefix 유무 무관) */
  generatedImages: Record<string, string>;
  /** slotId → mimeType (있으면 확장자에 우선 사용 — draft 내보내기용) */
  mimeBySlot?: Record<string, string>;
}

/** data URL prefix 가 있으면 제거하고 순수 base64만 반환 */
function stripDataUrlPrefix(b64: string): string {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

/** mimeType → 확장자 */
function extFromMime(mime: string): string | null {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

/**
 * base64 앞부분(매직바이트)으로 이미지 형식을 판별한다.
 * generatedImages 에 mimeType 이 없을 때 사용. 판별 불가 시 png(앱이 생성 이미지를 png 로 렌더)로 폴백.
 */
function extFromBase64(b64: string): string {
  const head = b64.slice(0, 16);
  if (head.startsWith("/9j/")) return "jpg"; // JPEG: FF D8 FF
  if (head.startsWith("iVBOR")) return "png"; // PNG: 89 50 4E 47
  if (head.startsWith("R0lGOD")) return "gif"; // GIF: 47 49 46 38
  if (head.startsWith("UklGR")) return "webp"; // WEBP: RIFF....WEBP
  return "png";
}

function resolveExt(b64: string, mime?: string): string {
  if (mime) {
    const fromMime = extFromMime(mime);
    if (fromMime) return fromMime;
  }
  return extFromBase64(b64);
}

/**
 * base64(매직바이트)로 이미지 mimeType 을 추정한다.
 * generatedImages 에는 mimeType 이 없으므로, 보관함에 복사 저장할 때 이 값을 함께 보관해
 * 나중에 ZIP 확장자를 정확히 맞춘다.
 */
export function detectImageMime(b64raw: string): string {
  const ext = extFromBase64(stripDataUrlPrefix(b64raw));
  return ext === "jpg" ? "image/jpeg" : `image/${ext}`;
}

/** base64 → Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 제어문자(0x00–0x1f, 0x7f) 제거 — 소스에 제어문자를 넣지 않으려고 코드포인트로 필터 */
function stripControlChars(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) continue;
    out += s[i];
  }
  return out;
}

/**
 * 파일/폴더 이름으로 안전하게 만든다.
 * OS 금지문자 제거, 제어문자 제거, 공백→_, 길이 제한.
 */
export function sanitizeFileName(raw: string, maxLen = 40): string {
  const cleaned = stripControlChars(raw || "")
    .replace(/[/\\:*?"<>|]/g, "") // OS 금지문자
    .replace(/\s+/g, "_") // 공백 → _
    .replace(/^[._]+|[._]+$/g, "") // 앞뒤 . _ 정리
    .trim();
  const trimmed = cleaned.slice(0, maxLen);
  return trimmed || "무제";
}

/** 2자리 0-패딩 (10 이상이면 그대로) */
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 본문의 [[BR]] 센티넬을 실제 줄바꿈으로 (미리보기와 동일하게 표시) */
function expandSentinels(text: string): string {
  return text.replace(/\[\[BR\]\]/g, "\n");
}

interface SlotPlan {
  slot: ImageSlot;
  /** 1-base 순번 (이미지 유무와 무관하게 슬롯 순서대로 부여) */
  number: number;
  /** 이미지가 있을 때만 — 같은 폴더에 저장될 파일명 (NN_설명.ext) */
  fileName: string | null;
  bytes: Uint8Array | null;
}

/**
 * 모든 슬롯에 대해 번호/파일명/바이트 계획을 만든다.
 * 번호는 전체 슬롯 순서(1-base)로 고정 — 이미지가 없는 슬롯도 번호는 차지한다.
 */
function buildSlotPlans(input: ExportZipInput): SlotPlan[] {
  const ordered = [...input.imageSlots].sort((a, b) => a.index - b.index);
  return ordered.map((slot, i) => {
    const number = i + 1;
    const raw = input.generatedImages[slot.id];
    const b64 = raw ? stripDataUrlPrefix(raw) : "";
    if (!b64) return { slot, number, fileName: null, bytes: null };
    const ext = resolveExt(b64, input.mimeBySlot?.[slot.id]);
    const descPart = sanitizeFileName(slot.description, 20);
    const namePart =
      descPart && descPart !== "무제" ? `${pad(number)}_${descPart}` : pad(number);
    return {
      slot,
      number,
      fileName: `${namePart}.${ext}`,
      bytes: base64ToBytes(b64),
    };
  });
}

/**
 * 본문.txt 생성 — 각 이미지 마커를 "번호 + 정확한 파일명 + 설명"으로 바꿔
 * 어떤 이미지가 본문 어디에 들어가는지 메모장에서 한눈에 매칭되게 한다.
 */
function buildPlainText(content: string, plans: SlotPlan[]): string {
  const byLine = new Map<number, SlotPlan>();
  for (const p of plans) byLine.set(p.slot.lineIndex, p);

  const lines = content.split("\n");
  const out = lines.map((line, idx) => {
    const p = byLine.get(idx);
    if (!p) return line;
    const num = pad(p.number);
    const desc = p.slot.description || "";
    if (p.fileName) {
      return `[이미지 ${num}] 👉 같은 폴더의 "${p.fileName}"  —  ${desc}`;
    }
    return `[이미지 ${num}] (생성된 이미지 없음)  —  ${desc}`;
  });
  return expandSentinels(out.join("\n"));
}

/**
 * 본문.md 생성 — 이미지 있는 마커는 ![번호 - 설명](파일명)으로 치환(같은 폴더 참조).
 * 이미지 없는 마커는 번호를 단 텍스트로 남긴다.
 */
function buildMarkdown(content: string, plans: SlotPlan[]): string {
  const byLine = new Map<number, SlotPlan>();
  for (const p of plans) byLine.set(p.slot.lineIndex, p);

  const lines = content.split("\n");
  const out = lines.map((line, idx) => {
    const p = byLine.get(idx);
    if (!p) return line;
    const num = pad(p.number);
    const desc = p.slot.description || "";
    if (p.fileName) {
      const alt = desc ? `이미지 ${num} - ${desc}` : `이미지 ${num}`;
      return `![${alt}](${p.fileName})`;
    }
    return `[이미지 ${num} (생성된 이미지 없음): ${desc}]`;
  });
  return expandSentinels(out.join("\n"));
}

/**
 * ZIP Blob 을 생성한다. (다운로드는 호출 측 또는 triggerDownload 로)
 * 본문 파일과 이미지 파일을 같은 폴더에 평평하게 담는다.
 */
export async function buildZipBlob(input: ExportZipInput): Promise<Blob> {
  const zip = new JSZip();
  const folderName = sanitizeFileName(input.title, 60);
  const root = zip.folder(folderName) ?? zip;

  const plans = buildSlotPlans(input);

  root.file("본문.txt", buildPlainText(input.content, plans));
  root.file("본문.md", buildMarkdown(input.content, plans));

  for (const p of plans) {
    if (p.fileName && p.bytes) {
      // 이미지는 이미 압축본이라 무압축(STORE) 으로 담아 속도/안정성 확보
      root.file(p.fileName, p.bytes, { compression: "STORE" });
    }
  }

  return zip.generateAsync({ type: "blob" });
}

/**
 * base64 이미지 한 장을 파일로 다운로드한다.
 * (Electron: will-download 핸들러가 "다른 이름으로 저장" 창을 띄움 — 기본 위치는 다운로드 폴더)
 * 확장자/mime 는 매직바이트로 판별. fileNameNoExt 는 sanitize 후 확장자를 붙인다.
 */
export function downloadImageFromBase64(base64: string, fileNameNoExt: string): void {
  const b64 = stripDataUrlPrefix(base64);
  const ext = extFromBase64(b64);
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const bytes = base64ToBytes(b64);
  // base64ToBytes 는 정확한 길이의 ArrayBuffer 를 새로 만드므로 buffer 를 그대로 Blob 으로.
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
  triggerDownload(blob, `${sanitizeFileName(fileNameNoExt, 60)}.${ext}`);
}


/**
 * 현재 작업물(또는 보관함 항목)을 ZIP 으로 내보내고 다운로드시킨다.
 */
export async function exportZip(input: ExportZipInput): Promise<void> {
  const blob = await buildZipBlob(input);
  const fileName = `${sanitizeFileName(input.title, 60)}.zip`;
  triggerDownload(blob, fileName);
}
