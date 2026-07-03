/**
 * 미리보기에서 고른 "본문 문단 하나"만 AI로 다시 쓰는 엔드포인트.
 *
 * 전체 글을 재생성하지 않고, 요청한 문단 텍스트만 새로 써서 반환한다.
 * 실제 본문 splice/커밋은 클라이언트가 수행(마커·이미지 보존은 클라 책임).
 *
 * 입력: { section, instruction, keyword?, before?, after?, apiKey? }
 * 출력: { rewritten: string }
 *
 * 서버 안전망: 응답에 [이미지: ]·## 소제목·#해시태그·> 인용구 줄이 섞이면 제거한다.
 * (마커/구조 줄이 본문에 끼면 재파싱 시 이미지 슬롯 index가 어긋나 유실될 수 있으므로 원천 차단.)
 */
import { buildRewriteSectionPrompt } from "@/lib/prompts/rewrite-section";
import { generateText } from "@/lib/gemini";
import { CONFIG } from "@/lib/config";

export const maxDuration = 30;

const MARKER_RE = /^\s*\[이미지:\s*(.+?)\]\s*$/;
const HEADING_RE = /^#{2,3}(\{[^}]+\})?\s+.+$/;

/** 마커/소제목/해시태그/인용구 줄을 제거해 순수 본문 문단만 남긴다. */
function stripStructuralLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (MARKER_RE.test(line)) return false;
      if (HEADING_RE.test(line)) return false;
      if (line.startsWith("> ")) return false;
      if (t.startsWith("#") && !t.startsWith("##")) {
        const tags = t.split(/\s+/).filter((x) => x.startsWith("#"));
        if (tags.length > 1) return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const { section, instruction, keyword, before, after, apiKey } =
      await request.json();

    if (
      typeof section !== "string" ||
      section.trim().length === 0 ||
      typeof instruction !== "string" ||
      instruction.trim().length === 0
    ) {
      return Response.json(
        { error: "고칠 문단(section)과 수정 요청(instruction)이 필요합니다." },
        { status: 400 },
      );
    }

    const prompt = buildRewriteSectionPrompt({
      section,
      instruction,
      keyword: typeof keyword === "string" ? keyword : undefined,
      before: typeof before === "string" ? before : undefined,
      after: typeof after === "string" ? after : undefined,
    });

    const raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey, {
      temperature: 0.5,
      responseMimeType: "application/json",
    });

    // 파싱. responseMimeType=json이라도 모델이 가끔 코드펜스/공백을 섞으므로 방어.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } catch {
          return Response.json(
            { error: "AI 응답을 이해하지 못했습니다. 다시 시도해주세요." },
            { status: 502 },
          );
        }
      } else {
        return Response.json(
          { error: "AI 응답이 비어있습니다." },
          { status: 502 },
        );
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        { error: "AI 응답 형식이 올바르지 않습니다." },
        { status: 502 },
      );
    }

    const candidate = (parsed as Record<string, unknown>).rewritten;
    if (typeof candidate !== "string") {
      return Response.json(
        { error: "AI가 다시 쓴 문단을 반환하지 않았습니다." },
        { status: 502 },
      );
    }

    // 서버 안전망: 마커/구조 줄 제거.
    const rewritten = stripStructuralLines(candidate);
    if (rewritten.length === 0) {
      return Response.json(
        { error: "AI가 내용을 만들지 못했습니다. 다시 시도해주세요." },
        { status: 502 },
      );
    }

    return Response.json({ rewritten });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "문단 다시 쓰기 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
