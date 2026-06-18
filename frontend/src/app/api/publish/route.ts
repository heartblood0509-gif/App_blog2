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
  const startedAt = Date.now();
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
      // 발행은 브라우저 자동화(로그인→에디터→본문/이미지 입력)가 끝나야 응답한다.
      // 본문이 길거나 이미지가 많으면 5분(undici 기본 headersTimeout)을 넘겨 멀쩡한 발행이
      // "fetch failed"로 끊기던 버그가 있어 longRunning 으로 timeout 상한을 넉넉히 둔다.
      longRunning: true,
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
    // backendFetch 가 throw 한 경우(연결 실패/타임아웃). causeCode 로 원인을 구분해
    // 정확한 안내를 돌려준다 — 예전엔 timeout 도 "백엔드 미실행"으로 싸잡아 오진했음.
    const e = error as {
      name?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    const code = e?.cause?.code;
    console.error("[publish] backendFetch failed", {
      name: e?.name,
      message: e?.message,
      causeCode: code,
      elapsedMs: Date.now() - startedAt,
    });

    let message: string;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
      message = "발행 서버에 연결할 수 없습니다. 앱을 재시작한 뒤 다시 시도해 주세요.";
    } else if (
      code === "UND_ERR_HEADERS_TIMEOUT" ||
      code === "UND_ERR_BODY_TIMEOUT" ||
      e?.name === "TimeoutError"
    ) {
      // longRunning(30분)으로 사실상 도달하기 어렵지만, 초과 시엔 정확히 안내.
      message =
        "발행 처리가 예상보다 오래 걸리고 있습니다. 열린 Chrome 창에서 글 상태를 확인하고, 필요하면 직접 '발행'을 눌러주세요.";
    } else {
      message = e?.message || "발행 서버 호출 중 오류가 발생했습니다.";
    }
    return Response.json({ error: message, error_code: code ?? null }, { status: 502 });
  }
}
