import { NextResponse } from "next/server";
import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const role = body && typeof body === "object" ? (body as { role?: unknown }).role : null;
  if (role !== "user" && role !== "admin") {
    return NextResponse.json({ error: "invalid-role" }, { status: 400 });
  }
  return withAdminRpc(
    request,
    callRpc("admin_set_user_role", { p_user_id: id, p_role: role }),
  );
}
