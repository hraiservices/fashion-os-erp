import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only helpers for the whatsapp-gallery Storage bucket (see
 * add_whatsapp_gallery_links.sql). Every image read is a signed URL minted here — both for the
 * public gallery page's <img> tags and its og:image metadata — never a direct client fetch, same
 * lockdown as order-media/product-media. Must never be imported into client code.
 */

export const WHATSAPP_GALLERY_BUCKET = "whatsapp-gallery";
const SIGNED_URL_TTL_SECONDS = 3600;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] || contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads one base64 image data: URL under this gallery's token and returns its object path. */
export async function uploadGalleryImage(db: SupabaseClient<Database>, token: string, dataUrl: string): Promise<string> {
  const { contentType, extension, bytes } = parseImageDataUrl(dataUrl);
  const path = `${token}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(WHATSAPP_GALLERY_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save image to storage: ${error.message}`);
  return path;
}

/** Signed URLs for a gallery's stored paths, in the same order — used for both the page's own
 *  <img> tags and its og:image (the first one). */
export async function resolveGalleryImageUrls(db: SupabaseClient<Database>, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from(WHATSAPP_GALLERY_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const urlByPath = new Map((data || []).map((d, i) => [d.path || paths[i], d.signedUrl] as const));
  return paths.map((p) => urlByPath.get(p) || "");
}
