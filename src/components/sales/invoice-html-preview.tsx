import { fmtDate, inr } from "@/lib/format";
import { GST_TYPE_LABELS } from "@/lib/gst";
import { DOC_STATUS_LABELS, totalPieces } from "@/lib/sales";
import { amountInWords } from "@/lib/number-to-words";
import { blankInvoiceTemplate, type InvoiceTemplateConfig } from "@/lib/invoice-template";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

/**
 * On-screen rendering of the exact same content as InvoiceDocument (src/lib/pdf/invoice-document.tsx)
 * — same fields, same order — but as plain HTML instead of a PDF embedded in an <iframe>. The PDF
 * approach showed the browser's own PDF-viewer chrome (dark toolbar, letterboxing) through the
 * iframe, which read as "a PDF viewer sitting on the page" rather than Zoho's actual document-style
 * preview, hence this separate on-screen layout for the "Show PDF View" toggle. Download/WhatsApp
 * "send PDF" still use the real @react-pdf/renderer document — this is purely a parallel preview.
 */
export function InvoiceHtmlPreview({
  invoice,
  shopName,
  shopPhone,
  shopAddress,
  shopGstin,
  shopEmail,
  customerGstin,
  customerAddress,
  customerEmail,
  template,
}: {
  invoice: SalesInvoiceWithBalance;
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  shopGstin?: string;
  shopEmail?: string;
  customerGstin?: string;
  customerAddress?: string;
  customerEmail?: string;
  template?: InvoiceTemplateConfig;
}) {
  const t = template || blankInvoiceTemplate();
  const accent = t.colorTheme || "#6D28D9";
  const lineSubtotal = invoice.items.reduce((s, i) => s + i.amount, 0);
  const discountAmount = lineSubtotal - invoice.taxableAmount + invoice.shippingCharges;

  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-white p-6 text-[#111827] shadow-sm dark:bg-white sm:p-10" style={{ fontFamily: "inherit" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {t.showLogo && t.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a stored data URL, not an optimizable remote image
            <img src={t.logoDataUrl} alt="Company logo" className="mb-1.5 object-contain" style={{ width: t.logoWidth, height: t.logoWidth }} />
          )}
          <p className="text-base font-semibold" style={{ fontWeight: t.boldShopName ? 700 : 500 }}>
            {shopName || "Your Company"}
          </p>
          {shopAddress && <p className="text-xs text-gray-500">{shopAddress}</p>}
          {shopPhone && <p className="text-xs text-gray-500">{shopPhone}</p>}
          {t.showCompanyEmail && shopEmail && <p className="text-xs text-gray-500">{shopEmail}</p>}
          {shopGstin && <p className="text-xs text-gray-500">GSTIN: {shopGstin}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold" style={{ color: accent }}>
            INVOICE
          </p>
          <p className="text-xs text-gray-500">{invoice.invoiceNumber}</p>
          <p className="text-xs text-gray-500">{DOC_STATUS_LABELS[invoice.docStatus]}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Billed to</p>
          <p className="mt-0.5 text-sm" style={{ fontWeight: t.boldCustomerName ? 700 : 400 }}>
            {invoice.customerName}
          </p>
          <p className="text-sm">{invoice.customerMobile}</p>
          {t.showCustomerAddress && customerAddress && <p className="text-sm">{customerAddress}</p>}
          {t.showCustomerEmail && customerEmail && <p className="text-sm">{customerEmail}</p>}
          {customerGstin && <p className="text-sm">GSTIN: {customerGstin}</p>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Invoice date</p>
          <p className="mt-0.5 text-sm">{fmtDate(invoice.invoiceDate)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Due date</p>
          <p className="mt-0.5 text-sm">{invoice.dueDate ? fmtDate(invoice.dueDate) : "—"}</p>
        </div>
      </div>

      {invoice.subject && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Subject</p>
          <p className="mt-0.5 text-sm">{invoice.subject}</p>
        </div>
      )}

      <div className="mt-4 overflow-hidden border-y">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-1.5 text-left text-[10px] font-semibold uppercase text-gray-600">Product</th>
              <th className="p-1.5 text-right text-[10px] font-semibold uppercase text-gray-600">Qty</th>
              <th className="p-1.5 text-right text-[10px] font-semibold uppercase text-gray-600">Price</th>
              <th className="p-1.5 text-right text-[10px] font-semibold uppercase text-gray-600">Disc %</th>
              <th className="p-1.5 text-right text-[10px] font-semibold uppercase text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="p-1.5">
                  {item.productName}
                  {item.description && <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>}
                </td>
                <td className="p-1.5 text-right tabular-nums">{item.qty}</td>
                <td className="p-1.5 text-right tabular-nums">{inr(item.unitPrice)}</td>
                <td className="p-1.5 text-right tabular-nums">{item.discountPercent > 0 ? `${item.discountPercent}%` : "—"}</td>
                <td className="p-1.5 text-right tabular-nums">{inr(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto mt-3 w-full max-w-xs space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total pieces</span>
          <span className="tabular-nums">{totalPieces(invoice.items)}</span>
        </div>
        {t.showSubtotal && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Line subtotal</span>
            <span className="tabular-nums">{inr(lineSubtotal)}</span>
          </div>
        )}
        {t.showDiscount && invoice.discountValue > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Discount ({invoice.discountType === "percent" ? `${invoice.discountValue}%` : "flat"})</span>
            <span className="tabular-nums">-{inr(discountAmount)}</span>
          </div>
        )}
        {t.showShipping && invoice.shippingCharges > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Shipping charges</span>
            <span className="tabular-nums">{inr(invoice.shippingCharges)}</span>
          </div>
        )}
        {t.showTax && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Taxable amount</span>
              <span className="tabular-nums">{inr(invoice.taxableAmount)}</span>
            </div>
            {invoice.gstType === "intra" && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">CGST</span>
                  <span className="tabular-nums">{inr(invoice.cgst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">SGST</span>
                  <span className="tabular-nums">{inr(invoice.sgst)}</span>
                </div>
              </>
            )}
            {invoice.gstType === "inter" && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">IGST</span>
                <span className="tabular-nums">{inr(invoice.igst)}</span>
              </div>
            )}
          </>
        )}
        {invoice.roundOff !== 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Round off</span>
            <span className="tabular-nums">
              {invoice.roundOff > 0 ? "+" : ""}
              {inr(invoice.roundOff)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t-2 pt-1 text-base font-bold" style={{ borderTopColor: accent }}>
          <span>Total ({GST_TYPE_LABELS[invoice.gstType]})</span>
          <span className="tabular-nums">{inr(invoice.total)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Paid</span>
          <span className="tabular-nums">{inr(invoice.paidTotal)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>Balance due</span>
          <span className="tabular-nums">{inr(invoice.balance)}</span>
        </div>
      </div>

      {t.showAmountInWords && <p className="mt-3 text-xs text-gray-600">{amountInWords(invoice.total)}</p>}

      {t.showQrCode && t.qrCodeDataUrl && (
        <div className="mt-3 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not an optimizable remote image */}
          <img src={t.qrCodeDataUrl} alt="Payment QR code" className="size-24" />
          <p className="mt-1 text-[10px] text-gray-500">Scan to pay</p>
        </div>
      )}

      {invoice.notes && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Notes</p>
          <p className="mt-0.5 text-sm">{invoice.notes}</p>
        </div>
      )}

      {invoice.terms && (
        <div className="mt-6 text-xs leading-relaxed text-gray-600">
          <p className="mb-1 font-semibold text-gray-700">Terms &amp; Conditions</p>
          <p className="whitespace-pre-line">{invoice.terms}</p>
        </div>
      )}

      {t.showBankDetails && t.bankDetails && (
        <div className="mt-3 text-xs leading-relaxed text-gray-700">
          <p className="mb-1 font-semibold text-gray-700">Bank Details</p>
          <p className="whitespace-pre-line">{t.bankDetails}</p>
        </div>
      )}

      {t.showSignature && t.signatureDataUrl && (
        <div className="mt-8 flex flex-col items-end">
          {/* eslint-disable-next-line @next/next/no-img-element -- a stored data URL, not an optimizable remote image */}
          <img src={t.signatureDataUrl} alt="Authorized signature" className="h-10 w-24 object-contain" />
          <p className="min-w-24 border-t border-gray-300 pt-1 text-center text-xs text-gray-500">Authorized Signatory</p>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-gray-400">{shopName || "Your Company"} · Generated from Fashion Flow</p>
    </div>
  );
}
