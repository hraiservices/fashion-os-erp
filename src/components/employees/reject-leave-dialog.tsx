"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRejectLeaveRequest } from "@/hooks/use-leave-requests";

export function RejectLeaveDialog({ requestId, open, onOpenChange }: { requestId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("");
  const reject = useRejectLeaveRequest();

  async function handleReject() {
    if (!requestId) return;
    if (!reason.trim()) return toast.error("A reason is required");
    try {
      await reject.mutateAsync({ id: requestId, reason: reason.trim() });
      toast.success("Leave request rejected");
      setReason("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReason(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject leave request</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this request being rejected?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
            {reject.isPending ? "Rejecting…" : "Reject request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
