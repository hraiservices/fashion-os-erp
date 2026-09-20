import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { PRODUCT_MEDIA_BUCKET, isMigratedMediaPath } from "@/lib/supabase/media-resolve";

/**
 * Server-only helpers for the product-media Storage bucket (see
 * supabase/migrations/create_product_media_storage_bucket.sql). Every function here takes a
 * service-role client (src/lib/supabase/service.ts) and must never be imported into client
 * code.
 */

export { PRODUCT_MEDIA_BUCKET };

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads a product photo to the product-media bucket and returns its object path. `null`
 *  passes through (no photo set); a photo that's already a Storage path (untouched since a
 *  previous save already migrated it) passes through too. */
export async function migrateProductImage(db: SupabaseClient<Database>, productId: string, imageDataUrl: string | null): Promise<string | null> {
  if (!imageDataUrl || isMigratedMediaPath(imageDataUrl)) return imageDataUrl;
  const { contentType, extension, bytes } = parseImageDataUrl(imageDataUrl);
  const path = `${productId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save product image to storage: ${error.message}`);
  return path;
}

/** Downloads a migrated product image's bytes for the WhatsApp media-proxy route
 *  (src/app/api/products/[id]/image/route.ts), which must serve real bytes at a stable URL
 *  rather than a redirect or a signed URL. */
export async function downloadProductImage(db: SupabaseClient<Database>, path: string): Promise<Blob | null> {
  const { data, error } = await db.storage.from(PRODUCT_MEDIA_BUCKET).download(path);
  if (error || !data) return null;
  return data;
}
