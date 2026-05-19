import { NextResponse } from "next/server";
import {
  getSupabaseServerConfig,
  isUserAuthDisabled,
} from "@/lib/server/auth/supabase";
import { SUPABASE_PUBLIC_CONFIG } from "@/lib/auth/public-config";

export const dynamic = "force-dynamic";

const REDIRECT_TO =
  process.env.SUPABASE_AUTH_REDIRECT_TO ||
  SUPABASE_PUBLIC_CONFIG.redirectTo;

export async function GET() {
  const config = getSupabaseServerConfig();
  const authRequired = !isUserAuthDisabled();
  return NextResponse.json({
    auth_required: authRequired,
    configured: Boolean(config),
    supabase_url: config?.url ?? null,
    supabase_anon_key: config?.anonKey ?? null,
    redirect_to: REDIRECT_TO,
  });
}
