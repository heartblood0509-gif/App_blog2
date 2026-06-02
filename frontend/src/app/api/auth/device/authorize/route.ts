import { NextResponse } from "next/server";
import {
  clearAppUserSessionCookie,
  createAppUserSession,
  setAppUserSessionCookie,
} from "@/lib/server/auth/app-user-session";
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

  // claim=true(앱 새로 켜기/로그인/재시도): 이 기기를 활성 기기로 점유.
  // claim=false(5분 배경 신호): 활성 기기 확인만(아니면 superseded).
  // claim 값이 boolean 이 아니면 null 로 넘겨 동시접속 제어에 참여시키지 않는다(호환 안전).
  const rawClaim =
    body && typeof body === "object" ? (body as { claim?: unknown }).claim : undefined;
  const claim = typeof rawClaim === "boolean" ? rawClaim : null;

  const authorized = await getAuthorizedUserClient(request);
  if ("error" in authorized) return authorized.error;

  const { data, error } = await authorized.supabase.rpc("authorize_device", {
    p_device_id: device.device_id,
    p_device_name: device.device_name,
    p_platform: device.platform,
    p_app_version: device.app_version,
    p_claim: claim,
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
  } else if (payload.status === "superseded") {
    // 다른 기기에 활성 자리를 넘겨준 경우, 이 기기의 API 세션 쿠키를 즉시 무효화한다.
    // (10분 TTL 만료를 기다리지 않고 다음 신호 시점에 곧바로 차단.)
    clearAppUserSessionCookie(response);
  }

  return response;
}
