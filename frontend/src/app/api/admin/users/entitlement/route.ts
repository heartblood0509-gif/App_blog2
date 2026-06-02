import { NextResponse } from "next/server";
import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

// 사용자 이름(display_name)과 메모(memo)만 수정한다. 상태는 건드리지 않는다.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = source.email;
  const displayName = source.display_name;
  const memo = source.memo;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }
  return withAdminRpc(
    request,
    callRpc("admin_update_entitlement", {
      p_email: email,
      p_display_name: typeof displayName === "string" && displayName.trim() ? displayName : null,
      p_memo: typeof memo === "string" && memo.trim() ? memo : null,
    }),
  );
}
