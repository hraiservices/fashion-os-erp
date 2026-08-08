"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordVendorPayment } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/lib/format";

const METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];

export function RecordVendorPaymentDialog({
  open,
  onOpenChange,
  billId,
  vendorId,
  billNumber,
  balance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  vendorId: string;
  billNumber: string;
  balance: number;
}) {
  const { data: user } = useCurrentUser();
  const recordPayment = useRecordVendorPayment();

  const [amount, setAmount] = useState(String(balance || ""));
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  function handleClose() {
    onOpenChange(false);
  }

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    try {
      await recordPayment.mutateAsync({ billId, vendorId, billNumber, amount: amt, method, date, note, userEmail: user?.email });
      toast.success(`Payment of ${inr(amt)} recorded`);
      setAmount("");
      setNote("");
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment · {billNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Amount (₹) — balance due {inr(balance)}</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Method</Label>
              <Select value={method} onValueChange={(v) => v && setMethod(v)}>
                <SelectTrigger className="w-full">
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Note</Label>
            <Textarea rows={2} placeholder="Optional…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={recordPayment.isPending}>
            {recordPayment.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
