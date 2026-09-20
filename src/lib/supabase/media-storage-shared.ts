/**
 * Bits of the order-media Storage convention (see
 * supabase/migrations/create_order_media_storage_bucket.sql) that are safe to import from
 * client code — no Node built-ins, no service-role client. Server-only upload/resolve logic
 * lives in src/lib/supabase/media-storage.ts instead.
 */

export const ORDER_MEDIA_BUCKET = "order-media";

/** An image already migrated to Storage is a plain object path ("<order_id>/<uuid>.jpg"); a
 *  legacy, not-yet-migrated image is still a raw base64 data: URL. */
export function isOrderMediaPath(value: string): boolean {
  return !!value && !value.startsWith("data:");
}
