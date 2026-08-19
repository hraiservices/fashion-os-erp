"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSetOrderRework } from "@/hooks/use-order-mutations";

/** Flag (or clear the flag on) an order for rework — tag only, never moves the order's stage. */
export function ReworkDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("");
  const setRework = useSetOrderRework();

  async function handleFlag() {
    if (!reason.trim()) return toast.error("A reason is required");
    try {
      await setRework.mutateAsync({ orderId, flag: true, reason: reason.trim() });
      toast.success("Order flagged for rework");
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
          <DialogTitle>Flag for rework</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="What needs to be redone?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleFlag} disabled={setRework.isPending}>
            {setRework.isPending ? "Flagging…" : "Flag for rework"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
