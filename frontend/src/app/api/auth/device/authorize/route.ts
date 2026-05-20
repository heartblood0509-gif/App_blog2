import { NextResponse } from "next/server";
import { createAppUserSession, setAppUserSessionCookie } from "@/lib/server/auth/app-user-session";
import {
  fetchProfileRole,
  getAuthorizedUserClient,
  normalizeDeviceAuthResponse,
  parseDeviceInfo,
} from "@/lib/server/auth/device-api";
import { getSupabaseServerConfig, isUserAuthDisabled } from "@/lib/server/auth/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isUserAuthDisabled()) {
    return NextResponse.json({ ok: true, status: "authorized" });
  }
  if (!getSupabaseServerConfig()) {
    return NextResponse.json({ error: "supabase-config-missing" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const device = parseDeviceInfo(body);
  if (!device) {
    return NextResponse.json({ error: "invalid-device-info" }, { status: 400 });
  }

  const authorized = await getAuthorizedUserClient(request);
  if ("error" in authorized) return authorized.error;

  const { data, error } = await authorized.supabase.rpc("authorize_device", {
    p_device_id: device.device_id,
    p_device_name: device.device_name,
    p_platform: device.platform,
    p_app_version: device.app_version,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, status: "error", message: error.message },
      { status: 500 },
    );
  }

  const payload = normalizeDeviceAuthResponse(data);
  payload.profile_role = await fetchProfileRole(authorized.supabase);
  const response = NextResponse.json(payload, {
    status: payload.ok && payload.status === "authorized" ? 200 : 403,
  });

  if (payload.ok && payload.status === "authorized") {
    const session = createAppUserSession({
      sub: authorized.user.id,
      email: authorized.user.email ?? null,
      device_id: device.device_id,
    });
    setAppUserSessionCookie(response, session);
  }

  return response;
}
