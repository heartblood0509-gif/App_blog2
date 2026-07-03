import { backendFetch } from "@/lib/backend-fetch";

// 쇼츠 제목 "저장한 색" 팔레트 프록시 — 백엔드 /saved-colors 로 중계.
// 동기화 엔진(profile-sync-engine)이 이 경로를 saved-color kind 의 로컬 스토어로 사용한다.
// PUT/DELETE 는 엔진 계약에 맞춰 ?id= 쿼리 → 백엔드 path 로 변환.

export async function GET() {
  try {
    const res = await backendFetch("/saved-colors/", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        {
          error: (data as { detail?: string }).detail || "저장한 색을 불러오지 못했습니다.",
          code: (data as { code?: string }).code,
        },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "백엔드 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await backendFetch("/saved-colors/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "색 저장에 실패했습니다." },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "백엔드 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "색 ID가 필요합니다." }, { status: 400 });
    }
    const body = await request.json();
    const res = await backendFetch(`/saved-colors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "색 수정에 실패했습니다." },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "백엔드 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "색 ID가 필요합니다." }, { status: 400 });
    }
    const res = await backendFetch(`/saved-colors/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "색 삭제에 실패했습니다." },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "백엔드 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
