"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Wallet, AlertTriangle } from "lucide-react";
import { useSalesInvoice, useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useRecordSalesPayment } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { istDateString } from "@/lib/ist-date";

const METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];

export default function RecordSalesPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: invoice, isLoading } = useSalesInvoice(id);
  const { data: allInvoices } = useSalesInvoices();
  const { data: user } = useCurrentUser();
  const recordPayment = useRecordSalesPayment();

  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(istDateString());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const amountValue = amount ?? (invoice ? String(invoice.balance || "") : "");

  const otherDueInvoices = (allInvoices || []).filter(
    (i) => i.id !== id && i.customerMobile === invoice?.customerMobile && i.balance > 0
  );
  const otherDueTotal = otherDueInvoices.reduce((sum, i) => sum + i.balance, 0);

  async function handleSave() {
    if (!invoice) return;
    const amt = parseFloat(amountValue);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        customerMobile: invoice.customerMobile,
        invoiceNumber: invoice.invoiceNumber,
        amount: amt,
        method,
        date,
        note: reference.trim() ? `Ref# ${reference.trim()}${note.trim() ? " — " + note.trim() : ""}` : note,
        userEmail: user?.email,
      });
      toast.success(`Payment of ${inr(amt)} recorded`);
      router.push(`/sales/invoices/${invoice.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <EmptyState title="Invoice not found" description="This invoice may have been deleted." />
      </div>
    );
  }

  if (!user?.perms.managePayments) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <EmptyState icon={Wallet} title="Not available" description="Only users with payment permissions can record a payment." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/sales/invoices/${invoice.id}`} />} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Payment for {invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">{invoice.customerName || invoice.customerMobile}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Form column */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Customer Name</Label>
                <Input value={invoice.customerName || invoice.customerMobile} disabled readOnly />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Invoice Number</Label>
                <Input value={invoice.invoiceNumber} disabled readOnly />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Amount Received (₹) — balance due {inr(invoice.balance)}</Label>
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={amountValue} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Payment Date</Label>
                <DatePicker value={date} onChange={setDate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Payment Mode</Label>
                <Select value={method} onValueChange={(v) => v && setMethod(v)}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Reference #</Label>
                <Input placeholder="Cheque / transaction / UTR number…" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea rows={3} placeholder="Optional…" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Button onClick={handleSave} disabled={recordPayment.isPending}>
              <Wallet className="size-4" /> {recordPayment.isPending ? "Saving…" : "Record Payment"}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`/sales/invoices/${invoice.id}`} />}>
              Cancel
            </Button>
          </div>
        </div>

        {/* Sidebar: customer due-balance panel */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="text-sm font-medium">{invoice.customerName || "Customer"}&rsquo;s Details</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{invoice.customerMobile}</p>

            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border">
              <div className="bg-card p-3 text-center">
                <p className="text-lg font-semibold tabular-nums">{inr(invoice.balance)}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">This invoice</p>
              </div>
              <div className="bg-card p-3 text-center">
                <BalanceDue amount={otherDueTotal} paidLabel={inr(otherDueTotal)} className="text-lg" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Other invoices</p>
              </div>
            </div>

            {otherDueInvoices.length > 0 && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" /> Also has {otherDueInvoices.length} other due invoice{otherDueInvoices.length > 1 ? "s" : ""}
                </p>
                <ul className="space-y-1.5">
                  {otherDueInvoices.map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/sales/invoices/${inv.id}`} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2.5 text-sm hover:bg-muted/60">
                        <span>
                          <span className="font-medium">{inv.invoiceNumber}</span>
                          <span className="block text-xs text-muted-foreground">{fmtDate(inv.invoiceDate)}</span>
                        </span>
                        <BalanceDue amount={inv.balance} paidLabel={inr(inv.balance)} className="shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
