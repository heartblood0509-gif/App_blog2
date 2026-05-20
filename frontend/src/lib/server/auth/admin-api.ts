import { NextResponse } from "next/server";
import { getAuthorizedUserClient } from "@/lib/server/auth/device-api";
import { getSupabaseServerConfig } from "@/lib/server/auth/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type RpcArgs = Record<string, unknown>;
type RpcHandler = (supabase: SupabaseClient) => Promise<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}>;

export async function withAdminRpc(
  request: Request,
  handler: RpcHandler,
): Promise<Response> {
  if (!getSupabaseServerConfig()) {
    return NextResponse.json({ error: "supabase-config-missing" }, { status: 503 });
  }

  const authorized = await getAuthorizedUserClient(request);
  if ("error" in authorized) {
    return authorized.error as Response;
  }

  const { data, error } = await handler(authorized.supabase);
  if (error) {
    const message = error.message ?? "";
    const isForbidden =
      message.includes("forbidden") ||
      message.includes("not-authenticated") ||
      error.code === "42501";
    return NextResponse.json(
      { ok: false, error: message || "rpc-error" },
      { status: isForbidden ? 403 : 500 },
    );
  }

  return NextResponse.json(data ?? { ok: true });
}

export function callRpc(name: string, args: RpcArgs = {}): RpcHandler {
  return async (supabase) => {
    const result = await supabase.rpc(name, args);
    return { data: result.data, error: result.error };
  };
}
