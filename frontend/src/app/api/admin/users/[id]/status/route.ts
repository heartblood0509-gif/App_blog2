import { NextResponse } from "next/server";
import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = body && typeof body === "object" ? (body as { status?: unknown }).status : null;
  if (typeof status !== "string") {
    return NextResponse.json({ error: "invalid-status" }, { status: 400 });
  }
  return withAdminRpc(
    request,
    callRpc("admin_set_user_status", { p_user_id: id, p_status: status }),
  );
}
