import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ATTENDANCE_MEDIA_BUCKET, isMigratedMediaPath } from "@/lib/supabase/media-resolve";

/**
 * Server-only helper for the employee-media Storage bucket (see
 * supabase/migrations/create_employee_media_storage_bucket.sql). Takes a service-role client
 * (src/lib/supabase/service.ts) and must never be imported into client code.
 */

export { ATTENDANCE_MEDIA_BUCKET };

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads a check-in/check-out selfie to the employee-media bucket and returns its object
 *  path. A photo that's already a Storage path (a retried request re-submitting an
 *  already-migrated value) passes through untouched. */
export async function migrateAttendancePhoto(db: SupabaseClient<Database>, employeeId: string, photo: string): Promise<string> {
  if (isMigratedMediaPath(photo)) return photo;
  const { contentType, extension, bytes } = parseImageDataUrl(photo);
  const path = `${employeeId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(ATTENDANCE_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save photo to storage: ${error.message}`);
  return path;
}
