import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Server-side Supabase client using the service-role key. Only ever imported
 * from api/*.ts handlers — never bundled into frontend code, so the
 * service-role key can't leak to the browser (same secure pattern the
 * previous version of this project already got right for its one Supabase
 * write path).
 *
 * Returns null (never throws) when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * aren't set, so callers can degrade gracefully — "this feature isn't
 * configured yet" rather than a 500.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
