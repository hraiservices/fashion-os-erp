import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Short-TTL, per-serverless-instance cache for the two app_settings reads that fire on nearly
 * every request (middleware's moduleEntitlements check, getServerUser()'s roleDefaultOverrides
 * read) — confirmed by a live performance audit as ~30% of every request this API serves.
 * See FASHION_FLOW_PERFORMANCE_REMEDIATION.md "Option A" for the tradeoff this accepts.
 *
 * Deliberately scoped to ONLY these two keys, never reused elsewhere: both are already treated
 * as soft/advisory in this codebase (module licensing fails open to DEFAULT_ENTITLEMENTS, role
 * overrides fail open to the built-in role defaults), so a few seconds of staleness after an
 * admin changes them is an acceptable, explicit tradeoff — never cache anything security-
 * critical (PIN hashes, permissions tied to a specific user, auth tokens) through this module.
 *
 * Cache scope is per-instance, not global: a change made through one serverless instance can
 * take up to TTL_MS to reach a *different* warm instance, and cold starts always miss.
 */

const TTL_MS = 15_000;
const cache = new Map<string, { value: Json | null; expiresAt: number }>();

export async function getCachedAppSetting(supabase: SupabaseClient<Database>, key: string): Promise<Json | null> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  const value = data?.value ?? null;
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
