"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaidAmount, BalanceDue } from "@/components/ui/money-text";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useRecordPayment } from "@/hooks/use-order-mutations";
import { computeRedemption } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

/** PaymentModal(), Stitching_Manager_Pro_v16.html ~line 4146. */
export function PaymentModal({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: customer } = useCustomerByMobile(order.mobile);
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const recordPayment = useRecordPayment();

  const [usePoints, setUsePoints] = useState(false);
  const [amount, setAmount] = useState(order.balance);
  const [payMethod, setPayMethod] = useState("Cash");
  const [note, setNote] = useState("");

  const availablePoints = loyaltyCfg?.enabled ? customer?.loyaltyPoints || 0 : 0;
  const redemption = loyaltyCfg ? computeRedemption(availablePoints, order.balance, loyaltyCfg) : { canRedeem: false, maxPtDiscount: 0, ptsToRedeem: 0 };
  const ptDiscount = usePoints && redemption.canRedeem ? redemption.maxPtDiscount : 0;
  const effectiveBalance = Math.max(0, order.balance - ptDiscount);

  // Sync amount to effectiveBalance only on initial open or when order.balance changes from
  // an external source (another device). The loyalty-points toggle also changes effectiveBalance,
  // but resetting the user's typed amount there is surprising — so track whether the user has
  // manually edited it and preserve that edit across toggle changes.
  const [amountEdited, setAmountEdited] = useState(false);
  useSyncFromSource(amountEdited ? null : effectiveBalance, (bal) => {
    if (bal != null) setAmount(bal);
  });
  // Intentionally only runs on order.balance changes, not on effectiveBalance (which includes ptDiscount).
  useSyncFromSource(order.balance, () => {
    // Reset the "edited" flag whenever the modal is reopened (order.balance changes).
    setAmountEdited(false);
    setAmount(effectiveBalance);
  });

  async function save() {
    try {
      await recordPayment.mutateAsync({ orderId: order.id, amount, payMethod, note, usePoints, expectedAdvance: order.advance });
      toast.success(amount + ptDiscount >= order.balance ? "Payment complete" : "Payment recorded");
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
            <Wallet className="size-4 text-muted-foreground" /> Collect payment
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-3 divide-x">
            <div className="p-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Billed</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{inr(order.total)}</p>
            </div>
            <div className="p-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
              <PaidAmount amount={order.advance} className="mt-0.5 block text-base" />
            </div>
            <div className="bg-red-500/5 p-3 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-red-600/80 dark:text-red-400/80">Balance due</p>
              <BalanceDue amount={order.balance} paidLabel={inr(order.balance)} className="mt-0.5 block text-base" />
            </div>
          </div>
        </div>

        {redemption.canRedeem && (
          <button
            type="button"
            onClick={() => setUsePoints((u) => !u)}
            className={cn("flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors", usePoints ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
          >
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border-2", usePoints ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
              {usePoints && <Check className="size-3.5" />}
            </span>
            <div>
              <div className="font-medium">Use loyalty points</div>
              <div className="text-xs text-muted-foreground">
                {availablePoints} pts available — save {inr(redemption.maxPtDiscount)} ({redemption.ptsToRedeem} pts used)
              </div>
            </div>
          </button>
        )}

        <div className="space-y-2">
          <Label>Amount received</Label>
          <NumberInput min={0} max={effectiveBalance} value={amount} onChange={(v) => { setAmountEdited(true); setAmount(Math.min(v, effectiveBalance)); }} />
        </div>
        <div className="space-y-2">
          <Label>Payment method</Label>
          <Select value={payMethod} onValueChange={(v) => v && setPayMethod(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Cash", "UPI", "Card", "Bank Transfer"].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Note (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={recordPayment.isPending || (!amount && !ptDiscount)}>
            {recordPayment.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
