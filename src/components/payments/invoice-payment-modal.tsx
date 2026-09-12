"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { PaidAmount, BalanceDue } from "@/components/ui/money-text";
import { useRecordSalesPayment } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { istDateString } from "@/lib/ist-date";
import { inr } from "@/lib/format";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

const METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];

/** Modal counterpart to /sales/invoices/[id]/payment — same useRecordSalesPayment mutation,
 *  just in a dialog so picking an invoice from the customer-first "New Payment" flow (see
 *  new-payment-dialog.tsx) feels the same as picking an order (PaymentModal), instead of
 *  leaving that flow to navigate to a whole separate page. */
export function InvoicePaymentModal({ invoice, open, onOpenChange }: { invoice: SalesInvoiceWithBalance; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: user } = useCurrentUser();
  const recordPayment = useRecordSalesPayment();

  const [amount, setAmount] = useState(invoice.balance);
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(istDateString());
  const [note, setNote] = useState("");

  async function save() {
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        customerMobile: invoice.customerMobile,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        method,
        date,
        note,
        userEmail: user?.email,
      });
      toast.success(amount >= invoice.balance ? "Payment complete" : "Payment recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" /> Collect payment — {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-3 divide-x">
            <div className="p-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Billed</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{inr(invoice.total)}</p>
            </div>
            <div className="p-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
              <PaidAmount amount={invoice.paidTotal} className="mt-0.5 block text-base" />
            </div>
            <div className="bg-red-500/5 p-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-red-600/80 dark:text-red-400/80">Balance due</p>
              <BalanceDue amount={invoice.balance} paidLabel={inr(invoice.balance)} className="mt-0.5 block text-base" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Amount received</Label>
          <NumberInput min={0} max={invoice.balance} value={amount} onChange={(v) => setAmount(Math.min(v, invoice.balance))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Payment date</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Note (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 px-4 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 px-4 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={save} disabled={recordPayment.isPending || !amount}>
            {recordPayment.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
