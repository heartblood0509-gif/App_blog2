import { backendFetch } from "@/lib/backend-fetch";
import {
  createBrandProfileInKv,
  deleteBrandProfileFromKv,
  hasBrandProfileKvStore,
  isVercelRuntime,
  listBrandProfilesFromKv,
  updateBrandProfileInKv,
} from "@/lib/server/brand-profile-store";

function kvMissingResponse() {
  return Response.json(
    {
      error:
        "브랜드 프로필 저장소가 설정되지 않았습니다. Vercel KV를 연결하고 KV_REST_API_URL, KV_REST_API_TOKEN 환경변수를 설정해주세요.",
    },
    { status: 500 },
  );
}

function errorResponse(err: unknown, fallback: string, status = 500) {
  const message = err instanceof Error ? err.message : fallback;
  return Response.json({ error: message || fallback }, { status });
}

export async function GET() {
  if (hasBrandProfileKvStore()) {
    try {
      const data = await listBrandProfilesFromKv();
      return Response.json(data);
    } catch {
      return Response.json([], { status: 200 });
    }
  }

  if (isVercelRuntime()) {
    return Response.json([], { status: 200 });
  }

  try {
    const res = await backendFetch("/brand-profiles/", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 백엔드 실패(특히 503 store_corrupt)를 빈 목록으로 숨기지 않고 그대로 노출.
      // (위 KV/Vercel 웹 분기의 []+200 은 의도된 동작이라 유지.)
      return Response.json(
        {
          error: (data as { detail?: string }).detail || "브랜드 프로필 목록을 불러오지 못했습니다.",
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
  if (hasBrandProfileKvStore()) {
    try {
      const body = await request.json();
      const data = await createBrandProfileInKv(body);
      return Response.json(data);
    } catch (err) {
      return errorResponse(err, "브랜드 프로필 등록에 실패했습니다.", 400);
    }
  }

  if (isVercelRuntime()) {
    return kvMissingResponse();
  }

  try {
    const body = await request.json();
    const res = await backendFetch("/brand-profiles/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "브랜드 프로필 등록에 실패했습니다." },
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
  if (hasBrandProfileKvStore()) {
    try {
      const { searchParams } = new URL(request.url);
      const profileId = searchParams.get("id");
      if (!profileId) {
        return Response.json({ error: "프로필 ID가 필요합니다." }, { status: 400 });
      }
      const body = await request.json();
      const data = await updateBrandProfileInKv(profileId, body);
      return Response.json(data);
    } catch (err) {
      return errorResponse(err, "브랜드 프로필 수정에 실패했습니다.", 400);
    }
  }

  if (isVercelRuntime()) {
    return kvMissingResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("id");
    if (!profileId) {
      return Response.json({ error: "프로필 ID가 필요합니다." }, { status: 400 });
    }
    const body = await request.json();
    const res = await backendFetch(`/brand-profiles/${profileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "브랜드 프로필 수정에 실패했습니다." },
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
  if (hasBrandProfileKvStore()) {
    try {
      const { searchParams } = new URL(request.url);
      const profileId = searchParams.get("id");
      if (!profileId) {
        return Response.json({ error: "프로필 ID가 필요합니다." }, { status: 400 });
      }
      await deleteBrandProfileFromKv(profileId);
      return Response.json({ message: `브랜드 프로필 '${profileId}'이 삭제되었습니다.` });
    } catch (err) {
      return errorResponse(err, "브랜드 프로필 삭제에 실패했습니다.", 400);
    }
  }

  if (isVercelRuntime()) {
    return kvMissingResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("id");
    if (!profileId) {
      return Response.json({ error: "프로필 ID가 필요합니다." }, { status: 400 });
    }
    const res = await backendFetch(`/brand-profiles/${profileId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.detail || "브랜드 프로필 삭제에 실패했습니다." },
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
