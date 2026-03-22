import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getDb(): ReturnType<typeof createClient<Database>> {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  _client = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

// Convenience alias
export const db = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof createClient<Database>>];
  },
});
