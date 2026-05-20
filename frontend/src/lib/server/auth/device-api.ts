import type { DeviceAuthResponse, DeviceInfo, ProfileRole } from "@/lib/auth/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createUserSupabaseClient,
  readBearerToken,
} from "@/lib/server/auth/supabase";

export function parseDeviceInfo(value: unknown): DeviceInfo | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const device_id = source.device_id;
  const device_name = source.device_name;
  const platform = source.platform;
  const app_version = source.app_version;
  if (
    typeof device_id !== "string" ||
    typeof device_name !== "string" ||
    typeof platform !== "string" ||
    typeof app_version !== "string"
  ) {
    return null;
  }
  if (!device_id || !device_name || !platform || !app_version) return null;
  return { device_id, device_name, platform, app_version };
}

export async function getAuthorizedUserClient(request: Request) {
  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return {
      error: Response.json({ error: "missing-bearer-token" }, { status: 401 }),
    } as const;
  }

  const supabase = createUserSupabaseClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return {
      error: Response.json({ error: "invalid-supabase-session" }, { status: 401 }),
    } as const;
  }

  return { supabase, user: data.user } as const;
}

export function normalizeDeviceAuthResponse(data: unknown): DeviceAuthResponse {
  if (data && typeof data === "object") {
    return data as DeviceAuthResponse;
  }
  return {
    ok: false,
    status: "error",
    message: "invalid-rpc-response",
  };
}

export async function fetchProfileRole(
  supabase: SupabaseClient,
): Promise<ProfileRole | null> {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error || !data || typeof data !== "object") return null;
  const role = (data as { role?: unknown }).role;
  return role === "admin" || role === "user" ? role : null;
}
