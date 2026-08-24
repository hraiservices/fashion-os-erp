import JsBarcode from "jsbarcode";
import { fmtDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/business-rules";

/** Same off-screen-SVG approach as src/lib/barcode.ts's renderBarcodeSvg — no new dependency,
 *  the order ID is already a short alphanumeric string Code128 handles natively. */
function renderBarcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", width: 2, height: 50, displayValue: true, fontSize: 12, margin: 6 });
  return svg.outerHTML;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Printable garment-bag tag: order ID (as a scannable barcode), customer, delivery date,
 * garment list, and special instructions — the "which bag is this" problem on a busy shop
 * floor. Same window.open + document.write + @page pattern as printBarcodeLabel
 * (src/lib/barcode.ts) and printThermalReceipt, so it doesn't fight the main app's print CSS.
 */
export function printOrderTag(order: Order, shop?: Shop, tailorName?: string) {
  const svg = renderBarcodeSvg(order.id);
  const win = window.open("", "_blank", "width=420,height=560");
  if (!win) return;

  const garmentLines = order.garments.map((g) => `${g.type}${g.no && g.no > 1 ? ` ×${g.no}` : ""}`).join(", ");

  win.document.write(`<!doctype html>
<html>
<head>
<title>${escapeHtml(order.id)} — Order Tag</title>
<style>
  @page { size: 80mm 120mm; margin: 4mm; }
  body { font-family: sans-serif; padding: 10px; text-align: center; }
  .shop { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
  svg { max-width: 100%; margin: 6px 0; }
  .name { font-weight: 700; font-size: 18px; margin-top: 8px; }
  .row { text-align: left; margin-top: 10px; font-size: 12px; }
  .label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .value { font-weight: 600; }
  .special { border-top: 1px dashed #999; margin-top: 10px; padding-top: 8px; text-align: left; font-size: 11px; }
</style>
</head>
<body>
  ${shop?.name ? `<div class="shop">${escapeHtml(shop.name)}</div>` : ""}
  ${svg}
  <div class="name">${escapeHtml(order.name)}</div>
  <div class="row"><div class="label">Garments</div><div class="value">${escapeHtml(garmentLines || "—")}</div></div>
  <div class="row"><div class="label">Delivery</div><div class="value">${escapeHtml(fmtDate(order.deliveryDate))}</div></div>
  <div class="row"><div class="label">Tailor</div><div class="value">${escapeHtml(tailorName || order.tailor || "—")}</div></div>
  ${order.special ? `<div class="special"><div class="label">Special instructions</div>${escapeHtml(order.special)}</div>` : ""}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
