import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_CONFIG } from "@/lib/auth/public-config";

export interface SupabaseServerConfig {
  url: string;
  anonKey: string;
}

export function isUserAuthDisabled(): boolean {
  return (
    process.env.APP_REQUIRE_USER_AUTH === "0" ||
    process.env.ALLOW_INSECURE_DEV_AUTH === "1"
  );
}

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
  const url = normalizeSupabaseUrl(
    firstNonEmpty(
      process.env.SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_PUBLIC_CONFIG.url,
    ),
  );
  const anonKey =
    firstNonEmpty(
      process.env.SUPABASE_ANON_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_PUBLIC_CONFIG.publishableKey,
    );
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function normalizeSupabaseUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

export function createUserSupabaseClient(accessToken: string) {
  const config = getSupabaseServerConfig();
  if (!config) {
    throw new Error("Supabase server config is missing");
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
