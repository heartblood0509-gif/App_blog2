import { backendFetch } from "@/lib/backend-fetch";

export async function GET() {
  try {
    const res = await backendFetch("/aeo-profiles/", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        {
          error: (data as { detail?: string }).detail || "AEO 프로필 목록을 불러오지 못했습니다.",
          code: (data as { code?: string }).code,
        },
        { status: res.status }
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "백엔드 서버에 연결할 수 없습니다." },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await backendFetch("/aeo-profiles/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "AEO 프로필 등록에 실패했습니다." },
        { status: res.status }
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "백엔드 서버에 연결할 수 없습니다." },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("id");
    if (!profileId) {
      return Response.json({ error: "프로필 ID가 필요합니다." }, { status: 400 });
    }
    const body = await request.json();
    const res = await backendFetch(`/aeo-profiles/${encodeURIComponent(profileId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "AEO 프로필 수정에 실패했습니다." },
        { status: res.status }
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "백엔드 서버에 연결할 수 없습니다." },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("id");
    if (!profileId) {
      return Response.json({ error: "프로필 ID가 필요합니다." }, { status: 400 });
    }
    const res = await backendFetch(`/aeo-profiles/${encodeURIComponent(profileId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "AEO 프로필 삭제에 실패했습니다." },
        { status: res.status }
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "백엔드 서버에 연결할 수 없습니다." },
      { status: 502 }
    );
  }
}
