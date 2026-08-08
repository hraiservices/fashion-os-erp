"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompleteWorkOrder } from "@/hooks/use-work-order-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { computeWoCost, type WorkOrderMaterial } from "@/lib/manufacturing";
import { inr } from "@/lib/format";
import type { WorkOrder } from "@/lib/types";

export function CompleteWorkOrderDialog({ open, onOpenChange, wo }: { open: boolean; onOpenChange: (open: boolean) => void; wo: WorkOrder }) {
  const { data: user } = useCurrentUser();
  const completeWo = useCompleteWorkOrder();
  const [rows, setRows] = useState<WorkOrderMaterial[]>([]);

  useEffect(() => {
    if (open) {
      setRows(wo.materials.map((m) => ({ ...m, qtyUsed: m.qtyUsed ?? m.qtyPlanned, qtyWasted: m.qtyWasted ?? 0 })));
    }
  }, [open, wo.materials]);

  function updateRow(rawMaterialId: string, patch: Partial<WorkOrderMaterial>) {
    setRows((rs) => rs.map((r) => (r.rawMaterialId === rawMaterialId ? { ...r, ...patch } : r)));
  }

  const preview = computeWoCost(rows, wo.laborCostPerPiece, wo.qtyToProduce);

  function handleClose() {
    onOpenChange(false);
  }

  async function handleComplete() {
    try {
      await completeWo.mutateAsync({
        id: wo.id,
        woNumber: wo.woNumber,
        productId: wo.productId,
        qtyToProduce: wo.qtyToProduce,
        laborCostPerPiece: wo.laborCostPerPiece,
        materials: rows,
        userEmail: user?.email,
      });
      toast.success(`${wo.woNumber} completed — stock updated`);
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete work order");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4" /> Complete {wo.woNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Confirm what was actually consumed. Both used and wasted quantities leave raw-material stock, but only <strong>used</strong> counts toward the product&apos;s cost —
            wastage is tracked separately.
          </p>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No materials linked — completing will only add finished-goods stock.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-2 text-left font-medium">Material</th>
                    <th className="p-2 text-right font-medium">Planned</th>
                    <th className="p-2 text-right font-medium">Used</th>
                    <th className="p-2 text-right font-medium">Wasted</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.rawMaterialId}>
                      <td className="p-2">
                        {r.rawMaterialName}
                        <span className="ml-1 text-xs text-muted-foreground">({r.unitName})</span>
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{r.qtyPlanned}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          className="w-20 text-right"
                          value={r.qtyUsed ?? 0}
                          onChange={(e) => updateRow(r.rawMaterialId, { qtyUsed: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          className="w-20 text-right"
                          value={r.qtyWasted ?? 0}
                          onChange={(e) => updateRow(r.rawMaterialId, { qtyWasted: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Material cost (used only)</span>
              <span className="tabular-nums">{inr(preview.materialCost)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Wastage cost (excluded from COGS)</span>
              <span className="tabular-nums">{inr(preview.wastageCost)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Labor cost ({wo.qtyToProduce} × {inr(wo.laborCostPerPiece)})</span>
              <span className="tabular-nums">{inr(preview.laborCost)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total cost</span>
              <span className="tabular-nums">{inr(preview.totalCost)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Cost per unit</span>
              <span className="tabular-nums">{inr(preview.costPerUnit)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 border-t px-5 py-3 shrink-0">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleComplete} disabled={completeWo.isPending}>
            {completeWo.isPending ? "Completing…" : `Complete · produce ${wo.qtyToProduce} units`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
