"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";
import { useRecordStockAdjustment } from "@/hooks/use-inventory-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import type { Product } from "@/lib/types";

type AdjustMode = "add" | "reduce";

/**
 * Product-scoped stock adjustment — same underlying inventory_ledger write as the generic
 * Inventory > Adjustments form, but pre-scoped to this product (Zoho Books-style "Adjust
 * Stock" on the item detail page) so the merchant doesn't have to re-pick the item.
 */
export function ProductStockAdjustmentDialog({ product, open, onOpenChange }: { product: Product; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: user } = useCurrentUser();
  const recordAdjustment = useRecordStockAdjustment();

  const [mode, setMode] = useState<AdjustMode>("add");
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");

  const movement = mode === "add" ? qty : -qty;
  const newStock = Math.max(0, product.stockQty + movement);

  function reset() {
    setMode("add");
    setQty(0);
    setNote("");
  }

  async function handleSave() {
    if (!qty) return toast.error("Enter a quantity");
    if (!note.trim()) return toast.error("A reason is required");
    if (mode === "reduce" && qty > product.stockQty) return toast.error(`Only ${product.stockQty} pcs in stock — can't reduce by more than that`);

    try {
      await recordAdjustment.mutateAsync({
        itemType: "product",
        itemId: product.id,
        itemName: product.name,
        movement,
        note: note.trim(),
        userEmail: user?.email,
      });
      toast.success(`Stock ${mode === "add" ? "increased" : "reduced"} to ${newStock} pcs`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to adjust stock");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-4 text-muted-foreground" /> Adjust stock — {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current stock</p>
          <p className="text-xl font-semibold tabular-nums">{product.stockQty} pcs</p>
        </div>

        <SegmentedToggle
          ariaLabel="Adjustment type"
          value={mode}
          onChange={setMode}
          options={[
            { value: "add", label: "Add stock" },
            { value: "reduce", label: "Reduce stock" },
          ]}
        />

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Quantity</Label>
          <NumberInput min={0} step="1" value={qty} onChange={setQty} className="h-10" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Reason *</Label>
          <Textarea rows={2} placeholder="e.g. New purchase received, damaged stock removed, physical count correction…" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {qty > 0 && (
          <p className="text-xs text-muted-foreground">
            New stock will be <span className="font-medium text-foreground">{newStock} pcs</span>
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={recordAdjustment.isPending || !qty}>
            {recordAdjustment.isPending ? "Saving…" : mode === "add" ? "Add stock" : "Reduce stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
