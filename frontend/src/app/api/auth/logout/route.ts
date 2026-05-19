import { NextResponse } from "next/server";
import { clearAppUserSessionCookie } from "@/lib/server/auth/app-user-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAppUserSessionCookie(response);
  return response;
}
