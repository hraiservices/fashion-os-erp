/**
 * Escapes text for interpolation into the HTML the print helpers build by hand.
 *
 * This matters more than it looks. `window.open("", …)` gives back an `about:blank` document
 * that inherits the opener's origin, so a `<script>` smuggled through a customer name, a
 * product name or a report cell runs *as the app*, with the staff member's Supabase session
 * sitting in localStorage next to it. And the text really is attacker-reachable: a lead name
 * comes from the public enquiry form, which needs no login at all.
 *
 * order-tag.ts and order-coupon.ts each had their own copy of this; thermal-receipt.ts and
 * export.ts's printReport interpolated raw. One shared helper, used by all of them, is the
 * point — quotes included, so it is safe inside an attribute value too.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
