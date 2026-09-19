import { inr, fmtDate } from "@/lib/format";
import type { SalesLineItem } from "@/lib/sales";

export interface ThermalReceiptData {
  shopName: string;
  shopPhone?: string;
  logoDataUrl?: string | null;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  items: SalesLineItem[];
  shippingCharges?: number;
  discountAmount?: number;
  taxAmount?: number;
  total: number;
  paid?: number;
  balance?: number;
  paymentMethod?: string;
  notes?: string;
  /** Must match the physical roll in the connected printer (shop.receiptPaperWidthMm) — a
   *  mismatch means the print is truncated (58mm content on a page sized for 80mm) or
   *  oversized/wasteful (80mm content on a page sized for 58mm). Defaults to 80mm, the
   *  original hardcoded value, for any caller that hasn't been updated to pass it yet. */
  paperWidthMm?: 58 | 80;
}

/**
 * Opens a clean, print-only tab formatted for thermal receipt paper (58mm or 80mm, per
 * `paperWidthMm`) and triggers window.print() — same "let the OS print pipeline handle the real
 * device" approach as printBarcodeLabel(). Thermal/receipt printers register as normal OS print
 * devices when connected via USB or network, so this works with any of them without
 * vendor-specific ESC/POS or WebUSB code, at the cost of not supporting silent/driverless printing.
 */
export function printThermalReceipt(data: ThermalReceiptData) {
  const widthMm = data.paperWidthMm ?? 80;
  // The narrower 58mm roll has less usable width once margins/print-head bounds are accounted
  // for — the same font sizes that fit comfortably on 80mm wrap awkwardly (or clip) on 58mm, so
  // scale typography down a step rather than just shrinking the page and keeping 80mm-sized text.
  const narrow = widthMm <= 58;
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) return;

  const itemRows = data.items
    .map(
      (i) => `
    <div class="item">
      <div class="item-name">${i.productName}</div>
      <div class="item-line">
        <span>${i.qty} x ${inr(i.unitPrice)}</span>
        <span>${inr(i.amount)}</span>
      </div>
    </div>`
    )
    .join("");

  const summaryRows = [
    data.shippingCharges ? `<div class="row"><span>Shipping</span><span>${inr(data.shippingCharges)}</span></div>` : "",
    data.discountAmount ? `<div class="row"><span>Discount</span><span>-${inr(data.discountAmount)}</span></div>` : "",
    data.taxAmount ? `<div class="row"><span>Tax</span><span>${inr(data.taxAmount)}</span></div>` : "",
  ].join("");

  const paymentRows =
    data.paid !== undefined
      ? `
    <div class="row"><span>Paid</span><span>${inr(data.paid)}</span></div>
    ${data.balance ? `<div class="row bold"><span>Balance Due</span><span>${inr(data.balance)}</span></div>` : ""}
    ${data.paymentMethod ? `<div class="row"><span>Method</span><span>${data.paymentMethod}</span></div>` : ""}
  `
      : "";

  win.document.write(`<!doctype html>
<html>
<head>
<title>Receipt ${data.invoiceNumber}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { width: ${widthMm}mm; margin: 0; padding: ${narrow ? 5 : 8}px; font-family: 'Courier New', monospace; font-size: ${narrow ? 10.5 : 12}px; color: #000; }
  .center { text-align: center; }
  .shop-name { font-size: ${narrow ? 13 : 15}px; font-weight: 700; }
  .muted { color: #444; font-size: ${narrow ? 9.5 : 11}px; }
  hr { border: none; border-top: 1px dashed #000; margin: ${narrow ? 6 : 8}px 0; }
  .item { margin-bottom: 4px; }
  .item-name { font-weight: 600; }
  .item-line, .row { display: flex; justify-content: space-between; }
  .row.bold { font-weight: 700; }
  .total-row { display: flex; justify-content: space-between; font-size: ${narrow ? 12.5 : 14}px; font-weight: 700; margin-top: 4px; }
  .footer { margin-top: 10px; text-align: center; font-size: ${narrow ? 9.5 : 11}px; }
</style>
</head>
<body>
  <div class="center">
    ${data.logoDataUrl ? `<img src="${data.logoDataUrl}" style="max-width:${narrow ? 36 : 50}mm;max-height:${narrow ? 15 : 20}mm;object-fit:contain;margin-bottom:4px;" alt="" />` : ""}
    <div class="shop-name">${data.shopName || "Receipt"}</div>
    ${data.shopPhone ? `<div class="muted">${data.shopPhone}</div>` : ""}
  </div>
  <hr />
  <div class="row"><span>${data.invoiceNumber}</span><span>${fmtDate(data.date)}</span></div>
  ${data.customerName ? `<div class="row"><span>Customer</span><span>${data.customerName}</span></div>` : ""}
  <hr />
  ${itemRows}
  <hr />
  ${summaryRows}
  <div class="total-row"><span>TOTAL</span><span>${inr(data.total)}</span></div>
  ${paymentRows}
  ${data.notes ? `<hr /><div class="muted">${data.notes}</div>` : ""}
  <div class="footer">Thank you!</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
