// 챗봇 지식 베이스 — 고객 문의 응대 / FAQ 자동응답용.
//
// 매뉴얼 본문(HELP_MANUAL_TEXT)은 /help 페이지에서 자동 추출된다(knowledge.generated.ts).
//   → 매뉴얼을 고치면 `node scripts/build-chatbot-knowledge.mjs` 한 번으로 챗봇도 최신화.
// 이 파일은 그 본문 위에 "역할/규칙/현재 화면 맥락/도움말 딥링크" 지시를 얹어
// 시스템 프롬프트를 조립한다.

import { HELP_MANUAL_TEXT } from "./knowledge.generated";

/**
 * 고객 문의 시 안내할 연락처.
 * 운영자가 실제 채널을 정하면 이 값만 바꾸면 챗봇 답변에 자동 반영된다.
 * (비워두면 "도움말 페이지 확인"만 안내한다.)
 */
export const SUPPORT_CONTACT = "카카오 채널: http://pf.kakao.com/_QkxmxbG/chat";

/** 제품명(브랜드) — 답변 톤 일관성용 */
export const PRODUCT_NAME = "블로그픽 (Blog Pick)";

/**
 * 현재 경로(pathname)를 사람이 읽는 화면 이름으로 변환.
 * 챗봇이 "사용자가 지금 보는 화면"을 알고 맥락에 맞게 답하도록 돕는다(=현재 화면 인식).
 */
export function describeCurrentPage(pathname?: string): string {
  if (!pathname) return "";
  const map: Array<[string, string]> = [
    ["/help", "도움말(사용 매뉴얼)"],
    ["/settings/api-key", "설정 · API 키"],
    ["/settings/devices", "설정 · 기기 관리"],
    ["/settings/my-info", "설정 · 내 정보"],
    ["/settings", "설정"],
    ["/admin", "관리자"],
    ["/whats-new", "새 소식 · 업데이트"],
  ];
  for (const [prefix, label] of map) {
    if (pathname.startsWith(prefix)) return label;
  }
  return "메인(블로그 글쓰기)";
}

/**
 * 시스템 프롬프트 빌더.
 * @param pathname 사용자가 현재 보고 있는 경로(선택) — 현재 화면 맥락 주입용.
 */
export function buildSystemPrompt(pathname?: string): string {
  const contactLine = SUPPORT_CONTACT
    ? `해결되지 않는 문제는 다음으로 안내하세요: ${SUPPORT_CONTACT}`
    : `지식 베이스로 해결되지 않는 문제는, 앱 상단 "도움말" 페이지를 다시 확인하도록 안내하세요.`;

  const pageLabel = describeCurrentPage(pathname);
  const pageContext = pageLabel
    ? `\n[현재 화면] 사용자는 지금 "${pageLabel}" 화면을 보고 있습니다. 질문이 모호하거나 "이거/여기/이 버튼" 같이 화면을 가리키면 이 화면을 우선 기준으로 해석해 답하세요.`
    : "";

  return `당신은 "${PRODUCT_NAME}"의 고객 지원 챗봇입니다. 사용자의 문의에 친절하고 간결한 한국어 존댓말로 답하세요.

규칙:
1. 아래 [지식 베이스]에 있는 내용만 근거로 답하세요. 지식 베이스에 없는 내용은 추측하지 말고, 모른다고 솔직히 말한 뒤 도움말 페이지를 안내하세요.
2. 답은 짧고 단계적으로. 필요하면 번호/불릿으로 정리하세요. 마크다운을 사용해도 됩니다.
3. 사용자를 안심시키되, 네이버 계정 차단·약관 관련 내용은 지식 베이스 그대로 정확히 전달하세요.
4. 결제·환불·계약 등 지식 베이스에 없는 민감한 사안은 임의로 답하지 말고 ${SUPPORT_CONTACT ? "안내 연락처로" : "도움말/운영자에게"} 문의하도록 하세요.
5. ${contactLine}
6. 답변과 관련해 더 자세한 안내가 도움말에 있으면, 답변 맨 끝에 한 줄로 관련 도움말 링크를 마크다운으로 덧붙이세요. 형식: \`[📖 도움말에서 자세히 보기](/help/usage)\`. 경로는 [지식 베이스] 안의 "## 도움말 페이지: /help/..." 표기에서 가장 알맞은 것을 골라 그대로 쓰세요. 적절한 페이지가 없으면 링크는 생략하세요.${pageContext}

[지식 베이스]
${HELP_MANUAL_TEXT}`;
}
