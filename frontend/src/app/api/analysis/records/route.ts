/**
 * 분석 보관함 — 백엔드 /analysis-records 프록시.
 *
 * 패턴은 /api/brand/profiles/route.ts 와 동일.
 * PUT/DELETE 는 searchParams.get("id") 로 record id 전달.
 */
import { backendFetch } from "@/lib/backend-fetch";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get("id");
    const scope = searchParams.get("scope");

    let path: string;
    if (recordId) {
      path = `/analysis-records/${encodeURIComponent(recordId)}`;
    } else if (scope) {
      path = `/analysis-records/?scope=${encodeURIComponent(scope)}`;
    } else {
      path = `/analysis-records/`;
    }
    const res = await backendFetch(path, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (recordId) {
        return Response.json(
          { error: (data as { detail?: string }).detail || "분석 레코드를 찾을 수 없습니다." },
          { status: res.status }
        );
      }
      return Response.json(
        {
          error: (data as { detail?: string }).detail || "분석 레코드 목록을 불러오지 못했습니다.",
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
    const res = await backendFetch(`/analysis-records/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "분석 레코드 저장에 실패했습니다." },
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
    const recordId = searchParams.get("id");
    if (!recordId) {
      return Response.json({ error: "레코드 ID가 필요합니다." }, { status: 400 });
    }
    const body = await request.json();
    const res = await backendFetch(`/analysis-records/${encodeURIComponent(recordId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "분석 레코드 수정에 실패했습니다." },
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
    const recordId = searchParams.get("id");
    if (!recordId) {
      return Response.json({ error: "레코드 ID가 필요합니다." }, { status: 400 });
    }
    const res = await backendFetch(`/analysis-records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: (data as { detail?: string }).detail || "분석 레코드 삭제에 실패했습니다." },
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
