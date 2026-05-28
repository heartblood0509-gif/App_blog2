// §D — 수동 발행 disconnect 폴링 proxy.
//
// frontend 가 5초 간격으로 호출. Next proxy.ts 가 app_session 쿠키 검증을 마친 뒤
// 이 라우트에서 backendFetch 로 Python 백엔드 /publish/manual-status/{id} 를 호출.

import { backendFetch } from "@/lib/backend-fetch";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id");
  if (!sessionId) {
    return Response.json({ disconnected: true }, { status: 400 });
  }
  try {
    const res = await backendFetch(`/publish/manual-status/${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      // 백엔드가 못 답하면 disconnected 로 간주해 busy 해제 (보수적 안전).
      return Response.json({ disconnected: true, published: false });
    }
    const data = await res.json();
    return Response.json({
      disconnected: Boolean(data.disconnected),
      published: Boolean(data.published),
    });
  } catch {
    return Response.json({ disconnected: true, published: false });
  }
}
