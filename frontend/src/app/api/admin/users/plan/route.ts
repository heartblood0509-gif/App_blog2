import { NextResponse } from "next/server";
import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

// 유튜브 플랜 ON/OFF — entitlement.plan 을 'blog'(유튜브 OFF) / 'blog_youtube'(ON) 로 설정.
// 이메일로 키잉(entitlement 테이블 기준). 상태(status)·역할(role)은 건드리지 않는다.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = source.email;
  const plan = source.plan;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }
  if (plan !== "blog" && plan !== "blog_youtube") {
    return NextResponse.json({ error: "invalid-plan" }, { status: 400 });
  }
  return withAdminRpc(
    request,
    callRpc("admin_set_user_plan", {
      p_email: email,
      p_plan: plan,
    }),
  );
}
