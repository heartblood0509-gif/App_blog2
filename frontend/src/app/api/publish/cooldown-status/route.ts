// 자동발행 1시간 쿨다운 상태 폴링 proxy.
//
// frontend 의 step-publish 가 마운트 시 + 30초 간격으로 호출.
// 백엔드 GET /publish/cooldown-status 로 위임.

import { backendFetch } from "@/lib/backend-fetch";

export async function GET() {
  try {
    const res = await backendFetch("/publish/cooldown-status", {
      cache: "no-store",
    });
    if (!res.ok) {
      // 백엔드 응답 불가 시 보수적으로 "쿨다운 없음" 으로 (사용자 차단 안 함).
      return Response.json({ remaining_sec: 0, last_publish_at: null });
    }
    const data = await res.json();
    return Response.json({
      remaining_sec: Number(data.remaining_sec ?? 0),
      last_publish_at: data.last_publish_at ?? null,
    });
  } catch {
    return Response.json({ remaining_sec: 0, last_publish_at: null });
  }
}
