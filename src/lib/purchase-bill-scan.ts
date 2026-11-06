/** Shared by the scan API route and the upload UI — see add_purchase_bill_scans.sql. */
export const BILL_SCAN_BUCKET = "bill-scans";

/** Comfortably covers a single-page photo or PDF while staying well under typical serverless
 *  request-body limits (the file travels as base64 JSON, not a separate signed-upload step —
 *  worth it for a one-shot "scan this bill" action, not worth it for a 25 MB WhatsApp video). */
export const BILL_SCAN_MAX_BYTES = 6 * 1024 * 1024;

export const BILL_SCAN_ACCEPT = "image/*,application/pdf";

export function isBillScanContentType(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

export function safeScanFileName(name: string): string {
  const base = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "scan";
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}`;
}
