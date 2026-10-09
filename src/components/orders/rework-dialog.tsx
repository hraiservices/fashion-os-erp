"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSetOrderRework } from "@/hooks/use-order-mutations";

/** Flag (or clear the flag on) an order for rework — tag only, never moves the order's stage.
 *
 *  `alreadyFlagged` covers the same-visit "customer tries it on, it's still wrong, again" case —
 *  a tailor fixing one issue only to have the customer spot a second (or third) problem minutes
 *  later, before ever leaving the counter. set_order_rework() only counts a rework as a fresh
 *  instance when the row transitions unflagged -> flagged (see its own comment), so re-submitting
 *  a new reason while still flagged would silently NOT bump reworkCount. Clearing the old flag
 *  first, then flagging with the new reason, makes each round count — same two API calls a
 *  clear-then-reflag by hand would make, just collapsed into one button/dialog. */
export function ReworkDialog({
  orderId,
  open,
  onOpenChange,
  alreadyFlagged = false,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alreadyFlagged?: boolean;
}) {
  const [reason, setReason] = useState("");
  const setRework = useSetOrderRework();

  async function handleFlag() {
    if (!reason.trim()) return toast.error("A reason is required");
    try {
      if (alreadyFlagged) await setRework.mutateAsync({ orderId, flag: false });
      await setRework.mutateAsync({ orderId, flag: true, reason: reason.trim() });
      toast.success(alreadyFlagged ? "Another rework round logged" : "Order flagged for rework");
      setReason("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to flag for rework");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReason(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alreadyFlagged ? "Flag again — new rework round" : "Flag for rework"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="What needs to be redone this time?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleFlag} disabled={setRework.isPending}>
            {setRework.isPending ? "Flagging…" : alreadyFlagged ? "Flag again" : "Flag for rework"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
