"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useRecordPayment } from "@/hooks/use-order-mutations";
import { computeRedemption } from "@/lib/business-rules";
import type { Order } from "@/lib/types";

function inr(n: number): string {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

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

  useEffect(() => {
    setAmount(effectiveBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePoints]);

  async function save() {
    try {
      await recordPayment.mutateAsync({ orderId: order.id, amount, payMethod, note, usePoints });
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
          <DialogTitle>Collect payment</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-amber-50 p-4">
          <div className="text-xs font-medium text-amber-800">BALANCE DUE</div>
          <div className="text-3xl font-light text-amber-700">{inr(order.balance)}</div>
          <div className="mt-1 text-xs text-amber-900">
            Total: {inr(order.total)} · Paid: {inr(order.advance)}
          </div>
        </div>

        {redemption.canRedeem && (
          <button
            type="button"
            onClick={() => setUsePoints((u) => !u)}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm ${usePoints ? "border-zinc-800 bg-zinc-50" : "border-zinc-200"}`}
          >
            <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${usePoints ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-300"}`}>
              {usePoints && <Check className="size-3.5" />}
            </div>
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
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)} />
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
