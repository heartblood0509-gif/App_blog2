import { CONFIG } from "@/lib/config";

const BACKEND_URL = CONFIG.BACKEND_URL;

interface ImagePayload {
  slot_id: string;
  description: string;
  group_id: string | null;
  pair_role?: "first" | "second";
  base64: string;
  mime_type?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, content, account_id, images, auto_publish } = body as {
      title: string;
      content: string;
      account_id: string;
      images?: ImagePayload[];
      auto_publish?: boolean;
    };

    if (!title || !content || !account_id) {
      return Response.json(
        { error: "제목, 본문, 계정 선택이 필요합니다." },
        { status: 400 }
      );
    }

    const res = await fetch(`${BACKEND_URL}/publish/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        account_id,
        images: images ?? [],
        auto_publish: auto_publish ?? true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "발행 서버 오류" }));
      return Response.json(
        { error: err.detail || "발행에 실패했습니다." },
        { status: res.status }
      );
    }

    const result = await res.json();
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "발행 서버에 연결할 수 없습니다. Python 백엔드가 실행 중인지 확인하세요.";
    return Response.json({ error: message }, { status: 502 });
  }
}
