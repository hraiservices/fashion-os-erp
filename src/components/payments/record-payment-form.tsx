"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, CreditCard, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePaymentAccounts } from "@/hooks/use-payment-accounts";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRecordPayment } from "@/hooks/use-order-mutations";
import { useRecordSalesPayment } from "@/hooks/use-sales-mutations";
import { isOrderOutstanding, sumOrdersOutstanding } from "@/lib/balances";
import { ORDER_PAYMENT_METHODS } from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";
import { inr, fmtDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

// The two ledgers (orders/order_payments, sales invoices/sales_payments) are entirely separate
// tables and RPCs — this form still writes to each via the same single-item mutations
// PaymentModal/InvoicePaymentModal already use one at a time (no new bulk RPC), it just lets one
// visit fill in several rows of either kind at once and submits them in one sequential pass.
// A row's Payment input is always capped at that row's own balance (server-enforced too), so
// there's no "overpayment becomes a credit" case to model — this app has no customer-credit
// ledger for either orders or invoices to hold that in.
//
// Payment Mode is restricted to ORDER_PAYMENT_METHODS (the stricter of the two — invoice
// payments accept any free-text method, order payments are a validated enum) so one selection
// is always valid no matter which kind of rows are in this submission.

type Row =
  | { kind: "order"; id: string; number: string; date: string; total: number; due: number; item: Order }
  | { kind: "invoice"; id: string; number: string; date: string; total: number; due: number; item: SalesInvoiceWithBalance };

export function RecordPaymentForm({ initialMobile }: { initialMobile?: string }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { profiles } = useCustomerProfiles();
  const { data: allInvoices } = useSalesInvoices();
  const { data: accounts } = usePaymentAccounts();
  const recordOrderPayment = useRecordPayment();
  const recordSalesPayment = useRecordSalesPayment();

  const [selectedMobile, setSelectedMobile] = useState<string | null>(initialMobile ?? null);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState(istDateString());
  const [method, setMethod] = useState(ORDER_PAYMENT_METHODS[0]);
  const [accountId, setAccountId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [rowPayments, setRowPayments] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const saving = progress !== null;

  const customerResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .map((c) => ({
        mobile: c.mobile,
        name: c.name,
        orderDue: sumOrdersOutstanding(c.orders),
        invoiceDue: (allInvoices || []).filter((i) => i.customerMobile === c.mobile).reduce((s, i) => s + i.balance, 0),
      }))
      .filter((c) => c.orderDue + c.invoiceDue > 0)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      .sort((a, b) => b.orderDue + b.invoiceDue - (a.orderDue + a.invoiceDue));
  }, [profiles, allInvoices, query]);

  const selectedCustomer = selectedMobile ? profiles.find((c) => c.mobile === selectedMobile) : undefined;

  const rows: Row[] = useMemo(() => {
    if (!selectedMobile || !selectedCustomer) return [];
    const orderRows: Row[] = selectedCustomer.orders.filter(isOrderOutstanding).map((o) => ({
      kind: "order", id: o.id, number: o.id, date: o.inDate, total: o.total, due: o.balance, item: o,
    }));
    const invoiceRows: Row[] = (allInvoices || [])
      .filter((i) => i.customerMobile === selectedMobile && i.balance > 0)
      .map((i) => ({ kind: "invoice", id: i.id, number: i.invoiceNumber, date: i.invoiceDate, total: i.total, due: i.balance, item: i }));
    return [...orderRows, ...invoiceRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedMobile, selectedCustomer, allInvoices]);

  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const amountReceived = rows.reduce((s, r) => s + Math.min(rowPayments[r.id] || 0, r.due), 0);

  function setRowAmount(id: string, due: number, value: number) {
    setRowPayments((prev) => ({ ...prev, [id]: Math.max(0, Math.min(value, due)) }));
  }

  function clearApplied() {
    setRowPayments({});
  }

  async function save() {
    const toApply = rows.filter((r) => (rowPayments[r.id] || 0) > 0);
    if (toApply.length === 0) {
      toast.error("Enter a payment amount for at least one row");
      return;
    }

    setProgress({ done: 0, total: toApply.length });
    for (let i = 0; i < toApply.length; i++) {
      const row = toApply[i];
      const amt = Math.min(rowPayments[row.id] || 0, row.due);
      try {
        if (row.kind === "order") {
          await recordOrderPayment.mutateAsync({
            orderId: row.item.id, amount: amt, payMethod: method, note, date,
            expectedAdvance: row.item.advance, accountId: accountId || undefined, reference,
          });
        } else {
          await recordSalesPayment.mutateAsync({
            invoiceId: row.item.id, customerMobile: row.item.customerMobile, invoiceNumber: row.item.invoiceNumber,
            amount: amt, method, date, note, userEmail: user?.email, accountId: accountId || undefined, reference,
          });
        }
        setProgress({ done: i + 1, total: toApply.length });
      } catch (e) {
        toast.error(
          `Stopped after ${i} of ${toApply.length} — ${row.number} failed: ${e instanceof Error ? e.message : "Payment failed"}. ` +
            `${i > 0 ? "Earlier payments in this batch were already recorded." : ""}`
        );
        setProgress(null);
        return;
      }
    }
    toast.success(`Payment recorded across ${toApply.length} row${toApply.length === 1 ? "" : "s"}`);
    setProgress(null);
    router.push(selectedMobile ? `/crm/${selectedMobile}` : "/dashboard");
  }

  if (!selectedMobile) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus placeholder="Search by name or mobile…" className="h-10 pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {customerResults.length === 0 ? (
          <EmptyState icon={CreditCard} title={query ? `No results for "${query}"` : "All payments collected"} description={query ? undefined : "No customer has an outstanding balance."} />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border">
            {customerResults.map((c) => (
              <li key={c.mobile}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50" onClick={() => setSelectedMobile(c.mobile)}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {c.name.trim().charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.mobile}</p>
                  </div>
                  <BalanceDue amount={c.orderDue + c.invoiceDue} paidLabel={inr(c.orderDue + c.invoiceDue)} className="shrink-0 text-sm font-semibold" />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!initialMobile && (
        <button type="button" onClick={() => setSelectedMobile(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Change customer
        </button>
      )}
      <div>
        <p className="text-lg font-semibold">{selectedCustomer?.name || selectedMobile}</p>
        <p className="text-sm text-muted-foreground">{selectedMobile}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Payment date</Label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="space-y-2">
          <Label>Payment mode</Label>
          <Select value={method} onValueChange={(v) => v && setMethod(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Deposit to</Label>
          <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {(accounts || []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Reference # (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / UPI ref no." />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Note (optional)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Unpaid orders &amp; invoices</p>
          <button type="button" onClick={clearApplied} className="text-xs text-muted-foreground hover:text-foreground">
            Clear applied amount
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">Nothing outstanding for this customer.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Due</th>
                  <th className="px-3 py-2 text-right">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 font-medium">
                      {r.number} <span className="ml-1 text-xs font-normal text-muted-foreground">{r.kind === "order" ? "Order" : "Invoice"}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.due)}</td>
                    <td className="px-3 py-2">
                      <div className="ml-auto flex max-w-40 flex-col items-end gap-0.5">
                        <NumberInput min={0} max={r.due} value={rowPayments[r.id] || 0} onChange={(v) => setRowAmount(r.id, r.due, v)} className="h-9 w-32" />
                        <button type="button" onClick={() => setRowAmount(r.id, r.due, r.due)} className="text-[11px] text-primary hover:underline">
                          Pay in full
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ml-auto max-w-xs space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
        <p className="flex items-center justify-between">
          <span className="text-muted-foreground">Total due</span>
          <span className="font-medium tabular-nums">{inr(totalDue)}</span>
        </p>
        <p className="flex items-center justify-between">
          <span className="text-muted-foreground">Amount received</span>
          <span className="font-semibold tabular-nums">{inr(amountReceived)}</span>
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || amountReceived <= 0}>
          {saving ? `Saving ${progress!.done}/${progress!.total}…` : "Record payment"}
        </Button>
      </div>
    </div>
  );
}
