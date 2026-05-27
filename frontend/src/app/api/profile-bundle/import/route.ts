import { backendFetch } from "@/lib/backend-fetch";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await backendFetch("/profile-bundle/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "프로필 가져오기에 실패했습니다." },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "백엔드 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}
