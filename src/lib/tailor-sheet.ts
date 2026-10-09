import { fmtDate, inr } from "@/lib/format";
import { hydrateMeasurements, toMKey } from "@/lib/measurements";
import { LINING_LABELS, type Lining } from "@/lib/business-rules";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/business-rules";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The work order a tailor is physically handed with the garments — everything they need to cut
 * and stitch, and nothing internal (no payments, no profit/payable figures). Two print sizes
 * share the same content: a narrow label-roll version for a label printer, and a full A4 version
 * with more breathing room. Same window.open + document.write + @page pattern as printOrderTag/
 * printBarcodeLabel, so it doesn't fight the main app's print CSS.
 */
function buildTailorSheetBody(order: Order, shop: Shop | undefined, measureFields: string[]): string {
  const garmentRows = order.garments
    .map((g) => {
      const lining = order.orderType === "alteration" ? "—" : LINING_LABELS[(g.lining as Lining) || "s"] || g.lining || "—";
      return `<tr><td>${escapeHtml(g.type)}</td><td>${g.no || 1}</td><td>${escapeHtml(lining)}</td><td>${inr(g.amount || 0)}</td></tr>`;
    })
    .join("");

  const measurementValues = hydrateMeasurements(measureFields, order.measurements);
  const measurementRows = measureFields
    .filter((label) => measurementValues[toMKey(label)])
    .map((label) => `<div class="mfield"><div class="mlabel">${escapeHtml(label)}</div><div class="mvalue">${escapeHtml(measurementValues[toMKey(label)])}</div></div>`)
    .join("");

  return `
  ${shop?.name ? `<div class="shop">${escapeHtml(shop.name)}</div>` : ""}
  <h1>Tailor Work Order — ${escapeHtml(order.id)}</h1>
  <div class="rows">
    <div class="row"><div class="label">Customer</div><div class="value">${escapeHtml(order.name)}</div></div>
    <div class="row"><div class="label">Mobile</div><div class="value">${escapeHtml(order.mobile || "—")}</div></div>
    <div class="row"><div class="label">Order Date</div><div class="value">${escapeHtml(fmtDate(order.inDate))}</div></div>
    <div class="row"><div class="label">Delivery Date</div><div class="value">${escapeHtml(fmtDate(order.deliveryDate))}</div></div>
    <div class="row"><div class="label">Order Value</div><div class="value">${inr(order.total)}</div></div>
  </div>
  <table class="garments">
    <thead><tr><th>Garment</th><th>Qty</th><th>Lining</th><th>Amount</th></tr></thead>
    <tbody>${garmentRows}</tbody>
  </table>
  ${order.special ? `<div class="special"><div class="label">Special Instructions</div><div class="value">${escapeHtml(order.special)}</div></div>` : ""}
  ${measurementRows ? `<div class="mtitle">Measurements</div><div class="mgrid">${measurementRows}</div>` : ""}
`;
}

/**
 * `paperWidthMm` must match the physical roll in the connected label/thermal printer — same
 * reasoning as ThermalReceiptData.paperWidthMm. 58mm has no room for a second measurement
 * column, so that layout is single-column regardless of width; 80mm just gets more breathing
 * room per line. Label text is solid black rather than the app's usual muted gray — thermal
 * printers vary a lot in how faithfully they reproduce light gray, and a field label that
 * doesn't print is worse than one that's slightly less visually quiet than on-screen.
 */
export function printTailorSheetLabel(order: Order, shop: Shop | undefined, measureFields: string[], paperWidthMm: 58 | 80 = 80) {
  const win = window.open("", "_blank", "width=420,height=700");
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(order.id)} — Tailor Work Order</title>
<style>
  @page { size: ${paperWidthMm}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: sans-serif; padding: 4px; color: #000; font-size: 11px; max-width: 100%; overflow-wrap: break-word; }
  .shop { font-weight: 700; font-size: 12px; text-align: center; margin-bottom: 2px; }
  h1 { font-size: 12px; font-weight: 700; text-align: center; margin: 0 0 8px; }
  .rows { margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; gap: 6px; padding: 2px 0; border-bottom: 1px dashed #999; }
  .label { color: #000; flex-shrink: 0; }
  .value { font-weight: 700; text-align: right; min-width: 0; overflow-wrap: break-word; }
  table.garments { table-layout: fixed; width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
  table.garments th, table.garments td { border-bottom: 1px solid #999; padding: 3px 2px; text-align: left; overflow-wrap: break-word; word-break: break-word; }
  table.garments th:last-child, table.garments td:last-child { text-align: right; }
  table.garments th:nth-child(1), table.garments td:nth-child(1) { width: 34%; }
  table.garments th:nth-child(2), table.garments td:nth-child(2) { width: 12%; }
  table.garments th:nth-child(3), table.garments td:nth-child(3) { width: 28%; }
  table.garments th:nth-child(4), table.garments td:nth-child(4) { width: 26%; }
  .special { border-top: 1px dashed #666; margin-top: 8px; padding-top: 6px; }
  .special .label { text-transform: uppercase; font-size: 9px; letter-spacing: 0.4px; margin-bottom: 2px; }
  .mtitle { font-weight: 700; margin-top: 10px; margin-bottom: 4px; border-top: 1px dashed #666; padding-top: 6px; }
  .mgrid { display: grid; grid-template-columns: 1fr; gap: 2px; }
  .mfield { display: flex; justify-content: space-between; gap: 6px; border-bottom: 1px dotted #999; }
  .mlabel { color: #000; flex-shrink: 0; }
  .mvalue { font-weight: 700; min-width: 0; overflow-wrap: break-word; text-align: right; }
</style>
</head>
<body>
  ${buildTailorSheetBody(order, shop, measureFields)}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}

export function printTailorSheetA4(order: Order, shop: Shop | undefined, measureFields: string[]) {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(order.id)} — Tailor Work Order</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: sans-serif; padding: 0; color: #111; font-size: 14px; }
  .shop { font-weight: 700; font-size: 18px; text-align: center; margin-bottom: 4px; }
  h1 { font-size: 20px; font-weight: 700; text-align: center; margin: 0 0 20px; }
  .rows { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
  .label { color: #666; }
  .value { font-weight: 600; }
  table.garments { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.garments th { background: #fafafa; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e4e4e7; font-size: 12px; text-transform: uppercase; color: #555; }
  table.garments td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
  table.garments th:last-child, table.garments td:last-child { text-align: right; }
  .special { border-top: 2px solid #e4e4e7; margin-top: 12px; padding-top: 12px; }
  .special .label { text-transform: uppercase; font-size: 11px; letter-spacing: 0.4px; margin-bottom: 4px; }
  .mtitle { font-weight: 700; font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-top: 2px solid #e4e4e7; padding-top: 12px; }
  .mgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 16px; }
  .mfield { border: 1px solid #e5e5e5; border-radius: 6px; padding: 6px 10px; }
  .mlabel { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .mvalue { font-weight: 700; font-size: 15px; }
</style>
</head>
<body>
  ${buildTailorSheetBody(order, shop, measureFields)}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
