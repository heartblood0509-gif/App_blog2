// 고객 지원(1:1 채팅) 연락처 상수 — 클라이언트·서버 공용.
//
// knowledge.ts 와 분리해 두는 이유: ChatWidget("use client")이 이 상수를 직접
// import 해도, knowledge.ts 가 끌고 오는 거대한 매뉴얼 전문(knowledge.generated)이
// 클라이언트 번들로 딸려오지 않게 하기 위함. 여긴 의존성 0.
//
// 운영 채널/시간이 바뀌면 이 파일만 고치면 챗봇 답변·하단 버튼에 모두 반영된다.

/** 1:1 채팅 문의(카카오 채널) 링크. https 사용(Electron 외부링크 정책 + 보안). */
export const SUPPORT_CHAT_URL = "https://pf.kakao.com/_QkxmxbG/chat";

/** 상담 시간·응답 방식 안내 한 줄. */
export const SUPPORT_HOURS_NOTE =
  "평일 오전 10시~오후 5시 답변 · 순차 답변이라 다소 늦을 수 있어요";

/** 챗봇 답변에서 안내할 문의처 한 줄(시스템 프롬프트에 주입). */
export const SUPPORT_CONTACT = `1:1 채팅 문의: ${SUPPORT_CHAT_URL} (${SUPPORT_HOURS_NOTE})`;
