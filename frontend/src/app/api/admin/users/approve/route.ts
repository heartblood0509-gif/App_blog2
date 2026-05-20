import { NextResponse } from "next/server";
import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body && typeof body === "object" ? (body as { email?: unknown }).email : null;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }
  return withAdminRpc(request, callRpc("admin_approve_user", { p_email: email }));
}
