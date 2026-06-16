import { backendFetch } from "@/lib/backend-fetch";

export async function GET() {
  try {
    const res = await backendFetch("/products/", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 백엔드 실패(특히 503 store_corrupt)를 빈 목록으로 숨기지 않고 그대로 노출 —
      // "제품 없음"으로 오인해 빈 상태로 덮어쓰는 사고 방지.
      return Response.json(
        {
          error: (data as { detail?: string }).detail || "제품 목록을 불러오지 못했습니다.",
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
    const res = await backendFetch("/products/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "제품 등록에 실패했습니다." },
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
    const productId = searchParams.get("id");
    if (!productId) {
      return Response.json({ error: "제품 ID가 필요합니다." }, { status: 400 });
    }
    const body = await request.json();
    const res = await backendFetch(`/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "제품 수정에 실패했습니다." },
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
    const productId = searchParams.get("id");
    if (!productId) {
      return Response.json({ error: "제품 ID가 필요합니다." }, { status: 400 });
    }
    const res = await backendFetch(`/products/${productId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "제품 삭제에 실패했습니다." },
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
