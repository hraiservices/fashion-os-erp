import JsBarcode from "jsbarcode";
import { fmtDate } from "@/lib/format";
import type { ReferralCoupon } from "@/lib/types";
import type { Shop } from "@/lib/business-rules";

/** Same off-screen-SVG approach as src/lib/barcode.ts and src/lib/order-tag.ts — no new dependency. */
function renderBarcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", width: 2, height: 50, displayValue: true, fontSize: 12, margin: 6 });
  return svg.outerHTML;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Printable referral coupon — same window.open + document.write + @page pattern as
 * printOrderTag (src/lib/order-tag.ts), so it doesn't fight the main app's print CSS.
 */
export function printCoupon(coupon: ReferralCoupon, shop?: Shop) {
  const svg = renderBarcodeSvg(coupon.code);
  const win = window.open("", "_blank", "width=420,height=520");
  if (!win) return;

  win.document.write(`<!doctype html>
<html>
<head>
<title>${escapeHtml(coupon.code)} — Referral Coupon</title>
<style>
  @page { size: 80mm 110mm; margin: 4mm; }
  body { font-family: sans-serif; padding: 10px; text-align: center; }
  .shop { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
  .headline { font-size: 16px; font-weight: 700; margin: 6px 0; }
  svg { max-width: 100%; margin: 6px 0; }
  .discount { font-size: 22px; font-weight: 800; color: #059669; margin: 8px 0; }
  .row { text-align: left; margin-top: 8px; font-size: 12px; }
  .label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .value { font-weight: 600; }
  .fineprint { border-top: 1px dashed #999; margin-top: 10px; padding-top: 8px; font-size: 10px; color: #666; }
</style>
</head>
<body>
  ${shop?.name ? `<div class="shop">${escapeHtml(shop.name)}</div>` : ""}
  <div class="headline">Referral Coupon</div>
  ${svg}
  <div class="discount">₹${coupon.discountAmount} OFF</div>
  <div class="row"><div class="label">Referred by</div><div class="value">${escapeHtml(coupon.referrerName || "—")}</div></div>
  <div class="row"><div class="label">Valid until</div><div class="value">${escapeHtml(fmtDate(coupon.expiresAt.slice(0, 10)))}</div></div>
  <div class="fineprint">Present this code when booking a new stitching order. One-time use, non-transferable value beyond the printed discount.</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
