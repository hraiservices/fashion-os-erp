import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only helpers for the branding-media Storage bucket (see
 * supabase/migrations/create_branding_storage_bucket.sql) — the shop logo and favicon, unlike
 * every other image this project stores, must be reachable with no session at all (login page,
 * favicon route, OG image), so this bucket is public and callers get back a plain public URL to
 * store directly in app_settings.shop, rather than an object path needing a signed-URL resolve
 * step like src/lib/supabase/media-resolve.ts's other buckets. Every function here takes a
 * service-role client (src/lib/supabase/service.ts) and must never be imported into client code.
 */

export const BRANDING_MEDIA_BUCKET = "branding-media";

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads a branding image (logo/favicon) and returns its public URL. `null` passes through (no
 *  image set); a value that's already an https:// Storage URL (unchanged since a previous save
 *  already migrated it) passes through too — only a raw `data:` URL triggers an upload. */
export async function migrateBrandingImage(db: SupabaseClient<Database>, key: "logo" | "favicon", dataUrl: string | null): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;
  const { contentType, extension, bytes } = parseImageDataUrl(dataUrl);
  const path = `${key}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(BRANDING_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save ${key} to storage: ${error.message}`);
  return db.storage.from(BRANDING_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
