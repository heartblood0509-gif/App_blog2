"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthConfigResponse } from "@/lib/auth/types";

let browserClient: SupabaseClient | null = null;
let browserClientKey: string | null = null;

export function getSupabaseBrowserClient(
  config: AuthConfigResponse,
): SupabaseClient {
  if (!config.supabase_url || !config.supabase_anon_key) {
    throw new Error("Supabase 설정이 없습니다.");
  }

  const key = `${config.supabase_url}:${config.supabase_anon_key}`;
  if (browserClient && browserClientKey === key) return browserClient;

  browserClient = createClient(config.supabase_url, config.supabase_anon_key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      storageKey: "app-blog-publisher-auth",
    },
  });
  browserClientKey = key;
  return browserClient;
}
