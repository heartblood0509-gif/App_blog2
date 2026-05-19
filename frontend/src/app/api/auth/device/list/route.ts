import { NextResponse } from "next/server";
import {
  getAuthorizedUserClient,
  normalizeDeviceAuthResponse,
} from "@/lib/server/auth/device-api";
import { getSupabaseServerConfig, isUserAuthDisabled } from "@/lib/server/auth/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isUserAuthDisabled()) {
    return NextResponse.json({ ok: true, status: "authorized", devices: [] });
  }
  if (!getSupabaseServerConfig()) {
    return NextResponse.json({ error: "supabase-config-missing" }, { status: 503 });
  }

  const authorized = await getAuthorizedUserClient(request);
  if ("error" in authorized) return authorized.error;

  const { data, error } = await authorized.supabase.rpc("list_devices");
  if (error) {
    return NextResponse.json(
      { ok: false, status: "error", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(normalizeDeviceAuthResponse(data));
}
