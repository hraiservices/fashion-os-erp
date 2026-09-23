import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only helper for the employee-documents Storage bucket (see
 * supabase/migrations/add_employee_documents.sql). Unlike employee-media, this bucket has no
 * `authenticated` read policy at all — every read is a signed URL minted here, from inside the
 * admin-gated document routes, using the service-role client. Must never be imported into
 * client code.
 */

export const EMPLOYEE_DOCUMENTS_BUCKET = "employee-documents";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function parseFileDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "application/octet-stream";
  const base64 = match?.[2] || "";
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] || contentType.split("/")[1] || "bin";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads a document (image or PDF, as a base64 data: URL) to the employee-documents bucket
 *  and returns its object path. */
export async function uploadEmployeeDocument(db: SupabaseClient<Database>, employeeId: string, dataUrl: string): Promise<string> {
  const { contentType, extension, bytes } = parseFileDataUrl(dataUrl);
  const path = `${employeeId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(EMPLOYEE_DOCUMENTS_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save document to storage: ${error.message}`);
  return path;
}

/** Signed URL for one stored document path, or null for an empty/missing path. */
export async function signEmployeeDocumentUrl(db: SupabaseClient<Database>, path: string | null, ttlSeconds = 300): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(EMPLOYEE_DOCUMENTS_BUCKET).createSignedUrl(path, ttlSeconds);
  return data?.signedUrl || null;
}

/** Best-effort delete — a failed remove (e.g. already gone) never blocks the caller's own
 *  success response, since the DB row/column is the source of truth for what's "current". */
export async function deleteEmployeeDocument(db: SupabaseClient<Database>, path: string | null): Promise<void> {
  if (!path) return;
  await db.storage.from(EMPLOYEE_DOCUMENTS_BUCKET).remove([path]).catch(() => {});
}
