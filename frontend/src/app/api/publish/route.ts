import { backendFetch } from "@/lib/backend-fetch";

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

    const res = await backendFetch("/publish/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        account_id,
        images: images ?? [],
        auto_publish: auto_publish ?? false,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "발행 서버 오류" }));
      const detail: unknown = err?.detail;
      let message = "발행에 실패했습니다.";
      let cooldownRemainingSec: number | undefined;

      if (
        detail &&
        typeof detail === "object" &&
        !Array.isArray(detail) &&
        (detail as { code?: string }).code === "cooldown-active"
      ) {
        // 1시간 쿨다운 — detail 이 객체라 그대로 두면 화면에 [object Object] 로 표시됨.
        const sec = Math.max(
          0,
          Number((detail as { remaining_sec?: number }).remaining_sec ?? 0)
        );
        cooldownRemainingSec = sec;
        const min = Math.max(1, Math.ceil(sec / 60));
        message = `발행은 1시간에 한 번만 가능해요. 약 ${min}분 후 다시 시도해주세요.`;
      } else if (typeof detail === "string") {
        message = detail;
      } else if (
        Array.isArray(detail) &&
        detail.length > 0 &&
        typeof (detail[0] as { msg?: string })?.msg === "string"
      ) {
        // FastAPI 422 검증 오류(detail 이 객체 배열)의 첫 항목.
        message = (detail[0] as { msg: string }).msg;
      } else if (
        detail &&
        typeof detail === "object" &&
        typeof (detail as { message?: string }).message === "string"
      ) {
        message = (detail as { message: string }).message;
      }

      return Response.json(
        {
          error: message,
          ...(cooldownRemainingSec !== undefined
            ? { cooldown_remaining_sec: cooldownRemainingSec }
            : {}),
        },
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
