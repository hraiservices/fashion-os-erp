import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client — bypasses RLS entirely. Only ever used server-side, from the
 * recurring-invoice cron route, which runs with no logged-in user session (Vercel Cron
 * hits it directly) so the normal cookie-based client has nothing to authenticate with.
 * Never import this into client code or any route reachable from the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false } });
}
