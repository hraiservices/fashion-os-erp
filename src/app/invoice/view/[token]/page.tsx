import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicInvoice } from "@/lib/public-invoice";
import { inr, fmtDate } from "@/lib/format";
import { GST_TYPE_LABELS } from "@/lib/gst";
import { Download } from "lucide-react";

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const data = await fetchPublicInvoice(supabase, token);
  if (!data) notFound();

  const { invoice, paidTotal, balance, shopName, shopPhone } = data;
  const lineSubtotal = invoice.items.reduce((s, i) => s + i.amount, 0);
  const discountAmount = lineSubtotal - invoice.taxableAmount + invoice.shippingCharges;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{shopName || "Invoice"}</h1>
          {shopPhone && <p className="text-sm text-muted-foreground">{shopPhone}</p>}
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold">INVOICE</p>
          <p className="text-sm text-muted-foreground">{invoice.invoiceNumber}</p>
        </div>
      </div>

      <a
        href={`/api/public/invoices/${token}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <Download className="size-4" /> Download PDF
      </a>

      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Billed to</p>
          <p className="mt-1 font-medium">{invoice.customerName}</p>
          <p className="text-sm text-muted-foreground">{invoice.customerMobile}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice date</p>
          <p className="mt-1">{fmtDate(invoice.invoiceDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Due date</p>
          <p className="mt-1">{invoice.dueDate ? fmtDate(invoice.dueDate) : "—"}</p>
        </div>
      </div>

      {invoice.subject && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p>
          <p className="mt-1">{invoice.subject}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-right">Disc %</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{item.productName}</td>
                <td className="p-3 text-right tabular-nums">{item.qty}</td>
                <td className="p-3 text-right tabular-nums">{inr(item.unitPrice)}</td>
                <td className="p-3 text-right tabular-nums">{item.discountPercent > 0 ? `${item.discountPercent}%` : "—"}</td>
                <td className="p-3 text-right tabular-nums">{inr(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Line subtotal</span>
          <span className="tabular-nums">{inr(lineSubtotal)}</span>
        </div>
        {invoice.discountValue > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount ({invoice.discountType === "percent" ? `${invoice.discountValue}%` : "flat"})</span>
            <span className="tabular-nums">-{inr(discountAmount)}</span>
          </div>
        )}
        {invoice.shippingCharges > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping charges</span>
            <span className="tabular-nums">{inr(invoice.shippingCharges)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Taxable amount</span>
          <span className="tabular-nums">{inr(invoice.taxableAmount)}</span>
        </div>
        {invoice.gstType === "intra" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CGST</span>
              <span className="tabular-nums">{inr(invoice.cgst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGST</span>
              <span className="tabular-nums">{inr(invoice.sgst)}</span>
            </div>
          </>
        )}
        {invoice.gstType === "inter" && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IGST</span>
            <span className="tabular-nums">{inr(invoice.igst)}</span>
          </div>
        )}
        {invoice.roundOff !== 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Round off</span>
            <span className="tabular-nums">
              {invoice.roundOff > 0 ? "+" : ""}
              {inr(invoice.roundOff)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
          <span>Total ({GST_TYPE_LABELS[invoice.gstType]})</span>
          <span className="tabular-nums">{inr(invoice.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid</span>
          <span className="tabular-nums">{inr(paidTotal)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Balance due</span>
          <span className="tabular-nums">{inr(balance)}</span>
        </div>
      </div>

      {invoice.notes && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-line text-sm">{invoice.notes}</p>
        </div>
      )}

      {invoice.terms && (
        <div className="border-t pt-4 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Terms & Conditions</p>
          <p className="whitespace-pre-line">{invoice.terms}</p>
        </div>
      )}

      <p className="pt-4 text-center text-xs text-muted-foreground">{shopName || "Your Shop"} · Generated from Stitching Manager Pro</p>
    </div>
  );
}
