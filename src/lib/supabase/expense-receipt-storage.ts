import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only helper for the expense-receipts Storage bucket (see
 * supabase/migrations/add_expense_receipt_vendor_reference.sql). No `authenticated` read
 * policy at all — the Expenses module is entirely server-API-mediated already (src/app/api/
 * expenses/*), so every read is a signed URL minted here from inside that same route, using the
 * service-role client. Must never be imported into client code.
 */

export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function parseImageDataUrl(dataUrl: string): { contentType: string; extension: string; bytes: Buffer } {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

/** Uploads a receipt photo (base64 image data: URL) and returns its object path. */
export async function uploadExpenseReceipt(db: SupabaseClient<Database>, expenseId: string, dataUrl: string): Promise<string> {
  const { contentType, extension, bytes } = parseImageDataUrl(dataUrl);
  const path = `${expenseId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from(EXPENSE_RECEIPTS_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not save receipt to storage: ${error.message}`);
  return path;
}

/** Signed URL for a stored receipt path, or null for an empty/missing path. */
export async function signExpenseReceiptUrl(db: SupabaseClient<Database>, path: string | null, ttlSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(EXPENSE_RECEIPTS_BUCKET).createSignedUrl(path, ttlSeconds);
  return data?.signedUrl || null;
}

/** Best-effort delete — a failed remove (e.g. already gone) never blocks the caller's own
 *  success response, since the expense row's own column is the source of truth for "current". */
export async function deleteExpenseReceipt(db: SupabaseClient<Database>, path: string | null): Promise<void> {
  if (!path) return;
  await db.storage.from(EXPENSE_RECEIPTS_BUCKET).remove([path]).catch(() => {});
}
