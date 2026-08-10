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
}

/**
 * Opens a clean, print-only tab formatted for 80mm thermal receipt paper and triggers
 * window.print() — same "let the OS print pipeline handle the real device" approach as
 * printBarcodeLabel(). Thermal/receipt printers register as normal OS print devices when
 * connected via USB or network, so this works with any of them without vendor-specific
 * ESC/POS or WebUSB code, at the cost of not supporting silent/driverless printing.
 */
export function printThermalReceipt(data: ThermalReceiptData) {
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
  @page { size: 80mm auto; margin: 0; }
  body { width: 80mm; margin: 0; padding: 8px; font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .shop-name { font-size: 15px; font-weight: 700; }
  .muted { color: #444; font-size: 11px; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  .item { margin-bottom: 4px; }
  .item-name { font-weight: 600; }
  .item-line, .row { display: flex; justify-content: space-between; }
  .row.bold { font-weight: 700; }
  .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; margin-top: 4px; }
  .footer { margin-top: 10px; text-align: center; font-size: 11px; }
</style>
</head>
<body>
  <div class="center">
    ${data.logoDataUrl ? `<img src="${data.logoDataUrl}" style="max-width:50mm;max-height:20mm;object-fit:contain;margin-bottom:4px;" alt="" />` : ""}
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
