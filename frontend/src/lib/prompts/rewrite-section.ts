/**
 * 미리보기에서 "이 문단만 다시 쓰기" 요청용 프롬프트.
 *
 * AI는 오직 대상 문단 하나만 새로 쓴다. 앞뒤 문단은 톤/흐름 참고용(읽기 전용)이며
 * 출력에 포함하지 않는다. [이미지: ]·## 소제목·#해시태그·> 인용구 줄은 절대 만들지 않는다
 * (마커/구조 줄이 섞이면 재파싱 시 이미지 슬롯이 어긋나 유실될 수 있음).
 *
 * 응답은 반드시 `{ "rewritten": "..." }` JSON 1개. 라우트가 responseMimeType=application/json 강제.
 */
import { WRITING_STYLE_RULES, ABSOLUTE_FORBIDDEN_RULES } from "./writing-rules";

export function buildRewriteSectionPrompt(params: {
  section: string;
  instruction: string;
  keyword?: string;
  before?: string;
  after?: string;
}): string {
  const { section, instruction, keyword, before, after } = params;

  return `너는 한국어 블로그 글의 한 문단만 고쳐 쓰는 편집자다.

# 지금 고칠 문단 (이 문단만 새로 써라)
${section}

# 사용자 지시
${instruction}

# 앞뒤 맥락 (읽기 전용 — 절대 다시 쓰지 마라. 톤·흐름 참고용)
[앞 문단]
${before?.trim() || "(없음)"}
[뒤 문단]
${after?.trim() || "(없음)"}

# 규칙
1. "지금 고칠 문단"만 새로 쓴다. 앞뒤 맥락 문단은 출력에 포함하지 않는다.
2. [이미지: ...] 줄, ## 소제목 줄, #해시태그 줄, > 인용구 줄을 절대 만들지 마라. 순수 본문 문단만 출력한다.
3. ${WRITING_STYLE_RULES}
4. ${ABSOLUTE_FORBIDDEN_RULES}
5. 문장부호(마침표 쉼표 느낌표 물음표 따옴표)를 사용하지 마라. 어미를 자연스럽게 정리(예: "~했다." → "~했음", "~좋아요." → "~좋아요").
6. 메인 키워드${keyword ? ` "${keyword}"` : ""}는 원문에 있던 만큼만 자연스럽게 유지한다(억지 삽입 금지).
7. 반드시 JSON 1개만 출력한다: { "rewritten": "새로 쓴 문단" } . 그 외 설명·코드블록·마크다운 금지.
`;
}
