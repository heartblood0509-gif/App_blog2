import { CONFIG } from "@/lib/config";

const BACKEND_URL = CONFIG.BACKEND_URL;

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/accounts/`, { cache: "no-store" });
    if (!res.ok) {
      return Response.json([], { status: 200 });
    }
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/accounts/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "계정 추가에 실패했습니다." },
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
    const accountId = searchParams.get("id");
    if (!accountId) {
      return Response.json({ error: "계정 ID가 필요합니다." }, { status: 400 });
    }
    const res = await fetch(`${BACKEND_URL}/accounts/${accountId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "계정 삭제에 실패했습니다." },
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
