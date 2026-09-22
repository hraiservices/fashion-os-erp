"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordPayment } from "@/hooks/use-order-mutations";
import { useRecordSalesPayment } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ORDER_PAYMENT_METHODS } from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";
import { inr, fmtDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

const INVOICE_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];

export type BulkPaymentTarget = { kind: "orders"; items: Order[] } | { kind: "invoices"; items: SalesInvoiceWithBalance[] };

/**
 * One payment amount, split across several of a customer's outstanding orders OR invoices
 * (never mixed — the two ledgers are entirely separate tables/RPCs) oldest-due-first. Each
 * allocation still goes through the existing single-item payment route/RPC
 * (record_order_payment / record_sales_payment) exactly as PaymentModal/InvoicePaymentModal do
 * one at a time — there is no new bulk RPC, so each allocation keeps every guarantee those
 * already have (row locking, overpayment/stale-advance guards, loyalty math). The trade-off is
 * that the whole batch isn't one all-or-nothing transaction: if an allocation partway through
 * fails, everything before it has already landed — reported to the user via the "Paid N of M"
 * count so nothing is silently lost or double-counted.
 */
export function BulkPaymentModal({ target, open, onOpenChange }: { target: BulkPaymentTarget; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: user } = useCurrentUser();
  const recordOrderPayment = useRecordPayment();
  const recordSalesPayment = useRecordSalesPayment();

  const totalDue = target.items.reduce((s, i) => s + i.balance, 0);
  const [amount, setAmount] = useState(totalDue);
  const [method, setMethod] = useState(target.kind === "orders" ? ORDER_PAYMENT_METHODS[0] : INVOICE_METHODS[0]);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const saving = progress !== null;

  // Oldest-due-first — an order's inDate, an invoice's invoiceDate.
  const sorted = useMemo(() => {
    if (target.kind === "orders") return [...target.items].sort((a, b) => new Date(a.inDate).getTime() - new Date(b.inDate).getTime());
    return [...target.items].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
  }, [target]);

  // Live preview of how the entered amount will land — capped per item at its own balance, the
  // remainder rolling forward to the next-oldest item, matching a shopkeeper handing over one
  // lump sum against a running tab.
  const allocations = useMemo(() => {
    const result: { item: Order | SalesInvoiceWithBalance; alloc: number }[] = [];
    let remaining = Math.max(0, amount);
    for (const item of sorted) {
      const alloc = Math.round(Math.min(item.balance, remaining) * 100) / 100;
      remaining = Math.round((remaining - alloc) * 100) / 100;
      result.push({ item, alloc });
    }
    return result;
  }, [sorted, amount]);

  async function save() {
    const toApply = allocations.filter((a) => a.alloc > 0);
    if (toApply.length === 0) return;

    setProgress({ done: 0, total: toApply.length });
    for (let i = 0; i < toApply.length; i++) {
      const { item, alloc } = toApply[i];
      try {
        if (target.kind === "orders") {
          const order = item as Order;
          await recordOrderPayment.mutateAsync({ orderId: order.id, amount: alloc, payMethod: method, note, expectedAdvance: order.advance });
        } else {
          const invoice = item as SalesInvoiceWithBalance;
          await recordSalesPayment.mutateAsync({
            invoiceId: invoice.id,
            customerMobile: invoice.customerMobile,
            invoiceNumber: invoice.invoiceNumber,
            amount: alloc,
            method,
            date: istDateString(),
            note,
            userEmail: user?.email,
          });
        }
        setProgress({ done: i + 1, total: toApply.length });
      } catch (e) {
        const label = target.kind === "orders" ? (item as Order).id : (item as SalesInvoiceWithBalance).invoiceNumber;
        toast.error(
          `Stopped after ${i} of ${toApply.length} — ${label} failed: ${e instanceof Error ? e.message : "Payment failed"}. ` +
            `${i > 0 ? "Earlier payments in this batch were already recorded." : ""}`
        );
        setProgress(null);
        return;
      }
    }
    toast.success(`Payment recorded across ${toApply.length} ${target.kind === "orders" ? "order" : "invoice"}${toApply.length === 1 ? "" : "s"}`);
    setProgress(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            One-time payment — {target.items.length} {target.kind === "orders" ? "orders" : "invoices"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Amount received</Label>
          <NumberInput min={0} max={totalDue} value={amount} onChange={(v) => setAmount(Math.min(v, totalDue))} />
          <p className="text-xs text-muted-foreground">
            Total due: {inr(totalDue)}. Applied oldest-first — any leftover balance stays open on the later items.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(target.kind === "orders" ? ORDER_PAYMENT_METHODS : INVOICE_METHODS).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} />
          </div>
        </div>

        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
          {allocations.map(({ item, alloc }) => {
            const id = target.kind === "orders" ? (item as Order).id : (item as SalesInvoiceWithBalance).invoiceNumber;
            const date = target.kind === "orders" ? (item as Order).inDate : (item as SalesInvoiceWithBalance).invoiceDate;
            return (
              <div key={item.id} className="flex items-center justify-between gap-2 px-1 py-1 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{id}</p>
                  <p className="truncate text-xs text-muted-foreground">{fmtDate(date)} · balance {inr(item.balance)}</p>
                </div>
                <span className={alloc > 0 ? "shrink-0 font-medium tabular-nums text-emerald-600 dark:text-emerald-400" : "shrink-0 text-xs text-muted-foreground"}>
                  {alloc > 0 ? inr(alloc) : "not covered"}
                </span>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 px-4 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="h-11 px-4 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={save} disabled={saving || !amount}>
            {saving ? `Paying ${progress!.done}/${progress!.total}…` : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
