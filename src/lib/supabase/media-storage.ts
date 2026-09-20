import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ORDER_MEDIA_BUCKET, isOrderMediaPath } from "@/lib/supabase/media-storage-shared";

/**
 * Server-only helpers for the order-media Storage bucket (see
 * supabase/migrations/create_order_media_storage_bucket.sql). Every function here takes a
 * service-role client (src/lib/supabase/service.ts) and must never be imported into client
 * code — the bucket has no write policy for `authenticated` at all, only the server writes to
 * it.
 *
 * Scoped to orders.images only (see that migration for why audios/videos aren't included).
 */

export { ORDER_MEDIA_BUCKET, isOrderMediaPath };
const SIGNED_URL_TTL_SECONDS = 3600;

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads one base64 image data: URL to the order-media bucket and returns its object path. */
export async function uploadOrderImage(db: SupabaseClient<Database>, orderId: string, dataUrl: string): Promise<string> {
  const { contentType, extension, bytes } = parseImageDataUrl(dataUrl);
  const path = `${orderId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(ORDER_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save image to storage: ${error.message}`);
  return path;
}

/** Uploads every not-yet-migrated (data:) entry in `images` and returns the array with each one
 *  replaced by its new Storage path. An entry that's already a Storage path (a previous save
 *  already migrated it) passes through untouched — this is what makes the migration safe to run
 *  opportunistically on every create/edit rather than needing a single big-bang backfill. */
export async function migrateOrderImages(db: SupabaseClient<Database>, orderId: string, images: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const img of images) {
    out.push(isOrderMediaPath(img) ? img : await uploadOrderImage(db, orderId, img));
  }
  return out;
}

/** Resolves an images array (legacy base64 data: URLs mixed with Storage paths) into a
 *  displayable array of URLs for server-rendered/server-returned contexts (the public track
 *  page, the attendance order-lookup API) — a data: URL passes through unchanged, a Storage
 *  path gets a short-lived signed URL. Client components use the equivalent
 *  useResolvedMediaUrls() hook (src/hooks/use-order-media.ts) instead, since they can't hold a
 *  service-role client. */
export async function resolveOrderImageUrls(db: SupabaseClient<Database>, images: string[]): Promise<string[]> {
  const paths = images.filter(isOrderMediaPath);
  if (paths.length === 0) return images;
  const { data } = await db.storage.from(ORDER_MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const urlByPath = new Map(
    (data || []).map((d, i) => [d.path || paths[i], d.signedUrl] as const).filter(([, url]) => !!url)
  );
  return images.map((img) => (isOrderMediaPath(img) ? urlByPath.get(img) || "" : img));
}
