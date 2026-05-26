/**
 * 본문에 검출된 "절대 금지 단어"(BANNED_*)에 대한 AI 대체어 제안 엔드포인트.
 *
 * 본문 자체는 절대 재작성하지 않고, 단어 → 대체어 매핑(JSON)만 반환한다.
 * 실제 본문 치환은 클라이언트에서 surgical replace로 수행 → 본문 보존 보장.
 *
 * 입력: { content, words, apiKey }
 *   - words: string[] — BANNED 로 검출된 단어 목록 (중복 제거된 상태)
 * 출력: { replacements: Record<string, string>, skipped: string[] }
 *   - replacements: 안전성 검증을 통과한 단어→대체어 매핑
 *   - skipped: AI가 또 다른 금지어로 대체했거나 응답에 누락되어 적용 불가한 단어 목록
 */
import { buildReplaceForbiddenPrompt } from "@/lib/prompts/replace-forbidden";
import { generateText } from "@/lib/gemini";
import { checkForbiddenWords } from "@/lib/quality/forbidden-words";
import { CONFIG } from "@/lib/config";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { content, words, apiKey } = await request.json();

    if (!content || !Array.isArray(words) || words.length === 0) {
      return Response.json(
        { error: "content와 1개 이상의 words가 필요합니다." },
        { status: 400 },
      );
    }

    // 중복 제거 + 빈 문자열 제거 (방어적)
    const uniqueWords = Array.from(
      new Set(
        (words as unknown[]).filter(
          (w): w is string => typeof w === "string" && w.trim().length > 0,
        ),
      ),
    );
    if (uniqueWords.length === 0) {
      return Response.json(
        { error: "유효한 단어가 없습니다." },
        { status: 400 },
      );
    }

    const prompt = buildReplaceForbiddenPrompt(content, uniqueWords);

    const raw = await generateText(prompt, CONFIG.GENERATION_MODEL, apiKey, {
      temperature: 0.3,
      responseMimeType: "application/json",
    });

    // 파싱. responseMimeType=json이라도 모델이 가끔 코드펜스나 공백을 섞으므로 방어.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 가장 흔한 오염: ```json ... ``` 코드펜스. 첫 { ~ 마지막 } 사이만 추출 재시도.
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

    const proposed = parsed as Record<string, unknown>;
    const replacements: Record<string, string> = {};
    const skipped: string[] = [];

    for (const word of uniqueWords) {
      const candidate = proposed[word];
      // 1) 키 누락 / 빈 값 / 비문자열
      if (typeof candidate !== "string" || candidate.trim().length === 0) {
        skipped.push(word);
        continue;
      }
      const trimmed = candidate.trim();
      // 2) 원단어와 동일 — 의미 없음
      if (trimmed === word) {
        skipped.push(word);
        continue;
      }
      // 3) 대체어 자체가 또 다른 금지어 (예: "도박" → "베팅" 같은 케이스)
      const reCheck = checkForbiddenWords(trimmed);
      if (reCheck.length > 0) {
        skipped.push(word);
        continue;
      }
      // 4) 너무 긴 응답 — 명사 1단어 룰 위반. 보수적으로 컷.
      //    한국어 명사 1단어는 보통 5자 이내. 띄어쓰기/특수문자 들어가면 거른다.
      if (trimmed.length > 8 || /\s|[.,!?"']/.test(trimmed)) {
        skipped.push(word);
        continue;
      }

      replacements[word] = trimmed;
    }

    return Response.json({ replacements, skipped });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "금지어 대체 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
