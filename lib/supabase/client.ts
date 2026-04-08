import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }

  client = createBrowserClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return client;
}

/**
 * Inject the custom KryptoKe JWT into the Supabase browser client so that
 * Supabase Realtime postgres_changes subscriptions pass RLS checks.
 *
 * Supabase exposes the Bearer token JWT claims via `request.jwt.claims` in
 * RLS policies (see migration 012_rls_custom_jwt.sql). This must be called
 * once on app boot, after the user's session is restored from localStorage.
 *
 * NOTE: JWT_SECRET in Vercel must match Supabase project JWT secret for
 * Supabase to verify the token. If they differ, Supabase rejects the token
 * and falls back to the anon role (no user context → RLS blocks everything).
 */
export async function setSupabaseSession(accessToken: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  // Supabase needs a refresh_token too — we pass the access_token as both
  // since we manage sessions ourselves and never use refresh_token flow.
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: accessToken,
  });
}

// Convenience export for use in components
export const supabase = {
  get client() {
    return getSupabaseBrowserClient();
  },
};
