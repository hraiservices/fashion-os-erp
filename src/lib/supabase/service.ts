import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client — bypasses RLS entirely. Used server-side across most API routes (not
 * just the recurring-invoice cron, which was this comment's original scope) wherever a table is
 * write-locked for `authenticated` under the lockdown_*.sql migrations. Because it bypasses RLS,
 * **every** call site is individually responsible for its own authorization — there is no
 * table-level backstop once this client is in play. Any new route that uses it must perform its
 * own `getServerUser()` + `user.perms.X`/`user.role === "admin"` check before touching data,
 * exactly like every existing call site does; grepping for `createServiceClient` without also
 * finding a permission check right above it is the one pattern to treat as a bug on sight.
 * Never import this into client code or any route reachable from the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false } });
}
