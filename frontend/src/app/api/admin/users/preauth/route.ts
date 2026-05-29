import { NextResponse } from "next/server";
import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRpc(request, callRpc("admin_list_preauth", {}));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = source.email;
  const note = source.note;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }
  return withAdminRpc(
    request,
    callRpc("admin_preauth_email", {
      p_email: email,
      p_note: typeof note === "string" ? note : null,
    }),
  );
}
