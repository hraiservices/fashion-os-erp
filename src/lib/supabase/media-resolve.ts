import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generic Storage-media helpers shared across every domain that stores a photo as a base64
 * data: URL today and is being moved to Supabase Storage (see
 * supabase/migrations/create_order_media_storage_bucket.sql for the orders precedent this
 * follows). Safe to import from both client and server code — no Node-only APIs here.
 */

export const ATTENDANCE_MEDIA_BUCKET = "employee-media";
export const PRODUCT_MEDIA_BUCKET = "product-media";

/** An image already migrated to Storage is a plain object path ("<id>/<uuid>.jpg"); a legacy,
 *  not-yet-migrated image is still a raw base64 data: URL. Same convention as
 *  src/lib/supabase/media-storage-shared.ts (orders). */
export function isMigratedMediaPath(value: string | null | undefined): value is string {
  return !!value && !value.startsWith("data:");
}

/** Resolves a mix of legacy base64 data: URLs, Storage object paths, and nulls into displayable
 *  URLs — a data: URL or null passes through unchanged, a path gets a short-lived signed URL.
 *  Works with either a service-role client (server) or an authenticated browser client
 *  (client), since Storage's signed-URL API doesn't care which. */
export async function resolveSignedMediaUrls(client: SupabaseClient, bucket: string, values: (string | null)[], ttlSeconds = 3600): Promise<(string | null)[]> {
  const paths = values.filter(isMigratedMediaPath);
  if (paths.length === 0) return values;
  const { data } = await client.storage.from(bucket).createSignedUrls(paths, ttlSeconds);
  const urlByPath = new Map(
    (data || []).map((d, i) => [d.path || paths[i], d.signedUrl] as const).filter(([, url]) => !!url)
  );
  return values.map((v) => (isMigratedMediaPath(v) ? urlByPath.get(v) || "" : v));
}
