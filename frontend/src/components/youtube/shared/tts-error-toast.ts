"use client";

// TTS 실패 토스트 — 타입캐스트 월 크레딧 소진만 특별 취급한다.
//
// 백엔드(core/tts_engines.py)가 402 CREDIT_INSUFFICIENT 를 한국어 안내로 바꿔 보내는데,
// 문구 안의 URL 은 토스트에서 글자일 뿐 눌리지 않는다. 그래서 여기서 URL 을 떼어내고
// 대신 '사용량 확인' 버튼을 달아 대시보드로 바로 갈 수 있게 한다.
//
// ⚠️ CREDIT_MARKER 는 백엔드 TYPECAST_CREDIT_MARKER 와 같은 문자열이어야 한다. 한쪽만
// 바꾸면 버튼이 조용히 사라진다(문구는 그대로 나와서 눈치채기 어렵다).

import { toast } from "sonner";

const CREDIT_MARKER = "타입캐스트 월 크레딧";
const USAGE_URL = "https://studio.typecast.ai/developers/api";

function openExternal(url: string) {
  if (window.electronAPI?.auth) window.electronAPI.auth.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

/** TTS 실패 토스트. 크레딧 소진이면 '사용량 확인' 버튼을 함께 띄운다. */
export function ttsErrorToast(e: unknown, fallback: string): void {
  const message = e instanceof Error ? e.message : fallback;
  if (!message.includes(CREDIT_MARKER)) {
    toast.error(message);
    return;
  }
  // "사용량 확인: https://..." 꼬리는 버튼이 대신하므로 본문에서 제거.
  const body = message.replace(/\s*사용량 확인:\s*\S+\s*$/, "").trim();
  toast.error(body, {
    duration: 12000,
    action: { label: "사용량 확인", onClick: () => openExternal(USAGE_URL) },
  });
}
