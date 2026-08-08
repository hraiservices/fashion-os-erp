import JsBarcode from "jsbarcode";
import { inr } from "@/lib/format";

/** Renders a Code128 barcode to an off-screen SVG (never attached to the visible DOM) and returns its markup. */
function renderBarcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", width: 2, height: 60, displayValue: true, fontSize: 14, margin: 8 });
  return svg.outerHTML;
}

/** Opens a clean, print-only tab with a printable barcode label — avoids fighting the main app's own print CSS. */
export function printBarcodeLabel(product: { name: string; sku: string; barcode: string | null; sellingPrice: number }) {
  if (!product.barcode) return;
  const svg = renderBarcodeSvg(product.barcode);
  const win = window.open("", "_blank", "width=420,height=320");
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
<head>
<title>${product.name} — Barcode Label</title>
<style>
  body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; text-align: center; }
  .name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
  .sku { font-size: 11px; color: #666; margin-bottom: 8px; }
  .price { font-weight: 700; font-size: 16px; margin-top: 8px; }
  svg { max-width: 100%; }
</style>
</head>
<body>
  <div class="name">${product.name}</div>
  <div class="sku">${product.sku}</div>
  ${svg}
  <div class="price">${inr(product.sellingPrice)}</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
