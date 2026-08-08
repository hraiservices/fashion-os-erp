"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRaiseVendorCredit } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genCreditNumber } from "@/lib/purchases";
import { LineItemsEditor, linesToItems, blankLine, type EditableLine } from "@/components/purchases/line-items-editor";

export function RaiseVendorCreditDialog({
  open,
  onOpenChange,
  vendorId,
  billId,
  billNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  billId: string;
  billNumber: string;
}) {
  const { data: user } = useCurrentUser();
  const raiseCredit = useRaiseVendorCredit();

  const [lines, setLines] = useState<EditableLine[]>([blankLine()]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function handleClose() {
    setLines([blankLine()]);
    setReason("");
    setNotes("");
    onOpenChange(false);
  }

  async function handleSave() {
    const items = linesToItems(lines);
    if (items.length === 0) return toast.error("Add at least one returned item");
    if (!reason.trim()) return toast.error("Enter a reason for the return");

    try {
      await raiseCredit.mutateAsync({
        vendorId,
        billId,
        billNumber,
        creditNumber: genCreditNumber(),
        date,
        items,
        reason,
        notes,
        userEmail: user?.email,
      });
      toast.success("Vendor credit raised — stock updated");
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to raise vendor credit");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 shrink-0">
          <DialogTitle>Raise vendor credit · {billNumber}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Returned items</Label>
            <LineItemsEditor lines={lines} onChange={setLines} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Return date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reason *</Label>
            <Input placeholder="e.g. Defective fabric roll" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea rows={2} placeholder="Optional…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 border-t px-5 py-3 shrink-0">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={raiseCredit.isPending}>
            {raiseCredit.isPending ? "Saving…" : "Raise credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
