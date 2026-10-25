import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only helpers for the customer-photos Storage bucket (see
 * supabase/migrations/add_customer_activity_log_photo.sql). Same shape as
 * src/lib/supabase/media-storage.ts's order-image helpers — a service-role client only, since
 * the bucket has no write policy for `authenticated` at all.
 */
export const CUSTOMER_PHOTOS_BUCKET = "customer-photos";

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads one base64 image data: URL to the customer-photos bucket and returns its object path.
 *  Overwrites (upsert) any previous photo at the same customer's path — a customer has at most
 *  one photo, unlike order images which accumulate. */
export async function uploadCustomerPhoto(db: SupabaseClient<Database>, mobile: string, dataUrl: string): Promise<string> {
  const { contentType, extension, bytes } = parseImageDataUrl(dataUrl);
  const path = `${mobile}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(CUSTOMER_PHOTOS_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save photo to storage: ${error.message}`);
  return path;
}

/** Best-effort delete of a customer's previous photo object — called when a new one replaces
 *  it, so the bucket doesn't accumulate orphaned files. Never throws: a cleanup failure must not
 *  block the new photo from being saved. */
export async function deleteCustomerPhoto(db: SupabaseClient<Database>, path: string): Promise<void> {
  try {
    await db.storage.from(CUSTOMER_PHOTOS_BUCKET).remove([path]);
  } catch (e) {
    console.error("Failed to delete previous customer photo:", e);
  }
}
