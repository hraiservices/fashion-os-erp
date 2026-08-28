"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Receipt, Wallet, Undo2, Trash2, Pencil, Send, Download, Copy, Link2, Printer } from "lucide-react";
import { printThermalReceipt } from "@/lib/thermal-receipt";
import { useSalesInvoice } from "@/hooks/use-sales-invoices";
import { useSalesPaymentsForInvoice } from "@/hooks/use-sales-payments";
import { useSalesCreditNotesForInvoice } from "@/hooks/use-sales-credit-notes";
import { useDeleteInvoice, useSetInvoiceDocStatus } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useAppSetting } from "@/hooks/use-app-setting";
import { inr, fmtDate } from "@/lib/format";
import { INVOICE_STATUS_LABELS, DOC_STATUS_LABELS } from "@/lib/sales";
import { GST_TYPE_LABELS } from "@/lib/gst";
import { DEFAULT_SALES_WHATSAPP_TEMPLATES, buildSalesWhatsAppUrl, type SalesWhatsAppTemplates } from "@/lib/sales-whatsapp";
import { DEFAULT_INVOICE_TEMPLATES_SETTING, getDefaultTemplate, type InvoiceTemplatesSetting } from "@/lib/invoice-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue, PaidAmount } from "@/components/ui/money-text";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { PrintButton } from "@/components/ui/print-button";
import { RaiseSalesCreditDialog } from "@/components/sales/raise-sales-credit-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SalesInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: invoice, isLoading } = useSalesInvoice(id);
  const { data: payments } = useSalesPaymentsForInvoice(id);
  const { data: credits } = useSalesCreditNotesForInvoice(id);
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const { data: templates } = useAppSetting<SalesWhatsAppTemplates>("salesWhatsAppTemplates", DEFAULT_SALES_WHATSAPP_TEMPLATES);
  const { data: invoiceTemplates } = useAppSetting<InvoiceTemplatesSetting>("invoiceTemplates", DEFAULT_INVOICE_TEMPLATES_SETTING);
  const { data: customer } = useCustomerByMobile(invoice?.customerMobile || "");
  const deleteInvoice = useDeleteInvoice();
  const setDocStatus = useSetInvoiceDocStatus();

  const template = getDefaultTemplate(invoiceTemplates || DEFAULT_INVOICE_TEMPLATES_SETTING);
  const showLogo = template.showLogo && template.logoDataUrl;
  const showQrCode = template.showQrCode && template.qrCodeDataUrl;
  const showSignature = template.showSignature && template.signatureDataUrl;

  const [creditOpen, setCreditOpen] = useState(false);

  const canManageSales = !!user?.perms.manageSales;
  const canManagePayments = !!user?.perms.managePayments;

  async function handleMarkSent() {
    if (!invoice) return;
    try {
      await setDocStatus.mutateAsync({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, docStatus: "sent", userEmail: user?.email });
      toast.success("Marked as sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDelete() {
    if (!invoice) return;
    try {
      await deleteInvoice.mutateAsync({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, userEmail: user?.email });
      toast.success("Invoice deleted — stock reverted");
      router.push("/sales/invoices");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete invoice");
    }
  }

  async function handleCopyShareLink() {
    if (!invoice) return;
    const url = `${window.location.origin}/invoice/view/${invoice.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  function waHref(type: keyof SalesWhatsAppTemplates) {
    if (!invoice) return "#";
    const tpl = templates?.[type] || DEFAULT_SALES_WHATSAPP_TEMPLATES[type];
    return buildSalesWhatsAppUrl(invoice.customerMobile, tpl, {
      name: invoice.customerName,
      invoiceNo: invoice.invoiceNumber,
      total: invoice.total,
      balance: invoice.balance,
      amount: payments?.[0]?.amount,
      dueDate: invoice.dueDate,
      shopName: shop?.name,
      shopPhone: shop?.phone,
      invoiceLink: typeof window !== "undefined" ? `${window.location.origin}/invoice/view/${invoice.shareToken}` : "",
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <EmptyState icon={Receipt} title="Invoice not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {showLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image
            <img src={template.logoDataUrl!} alt="Shop logo" className="h-12 w-12 shrink-0 rounded object-contain" />
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.invoiceNumber}</h1>
            {invoice.subject && <p className="mt-0.5 text-sm">{invoice.subject}</p>}
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invoice.customerName} · {fmtDate(invoice.invoiceDate)}
              {invoice.dueDate && ` · Due ${fmtDate(invoice.dueDate)}`}
            </p>
            {customer?.gstin && <p className="mt-0.5 text-xs text-muted-foreground">Customer GSTIN: {customer.gstin}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Badge variant="outline">{DOC_STATUS_LABELS[invoice.docStatus]}</Badge>
          <Badge variant={invoice.paymentStatus === "paid" ? "secondary" : "outline"}>{INVOICE_STATUS_LABELS[invoice.paymentStatus]}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Main column: line items, terms, payments, credits, notes */}
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-2 text-left font-medium">Product</th>
                  <th className="p-2 text-right font-medium">Qty</th>
                  <th className="p-2 text-right font-medium">Price</th>
                  <th className="p-2 text-right font-medium">Disc %</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoice.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">{item.productName}</td>
                    <td className="p-2 text-right tabular-nums">{item.qty}</td>
                    <td className="p-2 text-right tabular-nums">{inr(item.unitPrice)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{item.discountPercent > 0 ? `${item.discountPercent}%` : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{inr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {invoice.discountValue > 0 && (
                  <tr className="border-t bg-muted/30">
                    <td className="p-2 text-muted-foreground" colSpan={4}>
                      Discount ({invoice.discountType === "percent" ? `${invoice.discountValue}%` : "flat"})
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">
                      -{inr(invoice.items.reduce((s, i) => s + i.amount, 0) - invoice.taxableAmount + invoice.shippingCharges)}
                    </td>
                  </tr>
                )}
                {invoice.shippingCharges > 0 && (
                  <tr className="bg-muted/30">
                    <td className="p-2 text-muted-foreground" colSpan={4}>
                      Shipping charges
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(invoice.shippingCharges)}</td>
                  </tr>
                )}
                <tr className="border-t bg-muted/30">
                  <td className="p-2 text-muted-foreground" colSpan={4}>
                    Taxable amount
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(invoice.taxableAmount)}</td>
                </tr>
                {invoice.gstType !== "none" && (
                  <>
                    {invoice.gstType === "intra" ? (
                      <>
                        <tr className="bg-muted/30">
                          <td className="p-2 text-muted-foreground" colSpan={4}>
                            CGST
                          </td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(invoice.cgst)}</td>
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="p-2 text-muted-foreground" colSpan={4}>
                            SGST
                          </td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(invoice.sgst)}</td>
                        </tr>
                      </>
                    ) : (
                      <tr className="bg-muted/30">
                        <td className="p-2 text-muted-foreground" colSpan={4}>
                          IGST
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(invoice.igst)}</td>
                      </tr>
                    )}
                  </>
                )}
                {invoice.roundOff !== 0 && (
                  <tr className="bg-muted/30">
                    <td className="p-2 text-muted-foreground" colSpan={4}>
                      Round off
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">
                      {invoice.roundOff > 0 ? "+" : ""}
                      {inr(invoice.roundOff)}
                    </td>
                  </tr>
                )}
                <tr className="border-t font-medium">
                  <td className="p-2" colSpan={4}>
                    Total ({GST_TYPE_LABELS[invoice.gstType]})
                  </td>
                  <td className="p-2 text-right tabular-nums">{inr(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {invoice.terms && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="mb-1 font-medium">Terms & Conditions</p>
              <p className="whitespace-pre-line text-muted-foreground">{invoice.terms}</p>
            </div>
          )}

          {showQrCode && (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border bg-muted/30 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
              <img src={template.qrCodeDataUrl!} alt="Scan to pay" className="size-24 object-contain" />
              <p className="text-xs text-muted-foreground">Scan to pay</p>
            </div>
          )}

          {showSignature && (
            <div className="flex justify-end rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
                <img src={template.signatureDataUrl!} alt="Authorized signature" className="h-10 w-24 object-contain" />
                <p className="min-w-24 border-t pt-1 text-center text-xs text-muted-foreground">Authorized Signatory</p>
              </div>
            </div>
          )}

          {(payments?.length || 0) > 0 && (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Payments ({payments?.length})</h2>
              </div>
              <ul className="divide-y">
                {payments?.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p>{p.method}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(p.date)}
                        {p.note && ` · ${p.note}`}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(credits?.length || 0) > 0 && (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Credit notes ({credits?.length})</h2>
              </div>
              <ul className="divide-y">
                {credits?.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p>{c.creditNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(c.date)} · {c.reason}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">-{inr(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {invoice.notes && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="mb-1 font-medium">Notes</p>
              {invoice.notes}
            </div>
          )}
        </div>

        {/* Sidebar column: totals + grouped actions */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
              <div className="bg-card p-3 text-center">
                <p className="text-lg font-semibold tabular-nums">{inr(invoice.total)}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
              </div>
              <div className="bg-card p-3 text-center">
                <PaidAmount amount={invoice.paidTotal} className="text-lg" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
              </div>
              <div className="bg-card p-3 text-center">
                <BalanceDue amount={invoice.balance} paidLabel={inr(invoice.balance)} className="text-lg" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
              </div>
            </div>

            {canManagePayments && invoice.balance > 0 && (
              <Button className="mt-4 w-full h-12 text-base sm:h-7 sm:text-[0.8rem] print:hidden" nativeButton={false} render={<Link href={`/sales/invoices/${invoice.id}/payment`} />}>
                <Wallet className="size-4" /> Record payment
              </Button>
            )}

            <div className="mt-4 space-y-1.5 print:hidden">
              <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Share &amp; notify</p>
              <WhatsAppButton
                className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]"
                href={waHref(invoice.balance > 0 ? "paymentReminder" : "invoiceSent")}
                label={invoice.balance > 0 ? "Payment Reminder" : "Send Invoice"}
              />
              {(payments?.length || 0) > 0 && <WhatsAppButton className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" href={waHref("paymentReceived")} label="Send Receipt" />}
              <WhatsAppButton className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" href={waHref("sendPdfLink")} label="Send PDF on WhatsApp" />
              <Button variant="outline" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" onClick={handleCopyShareLink}>
                <Link2 className="size-4" /> Copy share link
              </Button>
              <PrintButton className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" />
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]"
                onClick={() =>
                  printThermalReceipt({
                    shopName: shop?.name || "",
                    shopPhone: shop?.phone || "",
                    logoDataUrl: shop?.logoDataUrl,
                    invoiceNumber: invoice.invoiceNumber,
                    date: invoice.invoiceDate,
                    customerName: invoice.customerName,
                    items: invoice.items,
                    shippingCharges: invoice.shippingCharges,
                    total: invoice.total,
                    paid: invoice.paidTotal,
                    balance: invoice.balance,
                    notes: invoice.notes,
                  })
                }
              >
                <Printer className="size-4" /> Thermal Receipt
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]"
                nativeButton={false}
                render={<a href={`/api/sales/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
              >
                <Download className="size-4" /> Download PDF
              </Button>
              {canManageSales && invoice.docStatus === "draft" && (
                <Button
                  variant="outline"
                  onClick={handleMarkSent}
                  disabled={setDocStatus.isPending}
                  className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem] border-green-600/30 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 dark:border-green-500/30 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60"
                >
                  <Send className="size-4" /> Mark as sent
                </Button>
              )}
            </div>

            {canManageSales && (
              <div className="mt-4 space-y-1.5 border-t pt-4 print:hidden">
                <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Manage</p>
                <Button variant="outline" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" nativeButton={false} render={<Link href={`/sales/invoices/${invoice.id}/edit`} />}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button variant="outline" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" nativeButton={false} render={<Link href={`/sales/invoices/new?cloneId=${invoice.id}`} />}>
                  <Copy className="size-4" /> Clone
                </Button>
                <Button variant="outline" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" onClick={() => setCreditOpen(true)}>
                  <Undo2 className="size-4" /> Raise credit note
                </Button>
              </div>
            )}

            {canManageSales && (
              <div className="mt-4 border-t pt-4 print:hidden">
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]"><Trash2 className="size-4" /> Delete invoice</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {invoice.invoiceNumber}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This reverses the stock this invoice deducted from finished goods, and cannot be undone.
                        {(payments?.length || 0) > 0 && " This invoice has recorded payments — delete those first."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </div>

      {canManageSales && (
        <RaiseSalesCreditDialog open={creditOpen} onOpenChange={setCreditOpen} invoiceId={invoice.id} customerMobile={invoice.customerMobile} invoiceNumber={invoice.invoiceNumber} />
      )}
    </div>
  );
}
