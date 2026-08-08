"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ShoppingBag, Plus, X, ListTree, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveProduct } from "@/hooks/use-inventory-mutations";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useCurrentUser } from "@/hooks/use-current-user";
import { printBarcodeLabel } from "@/lib/barcode";
import type { Product } from "@/lib/types";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  category: z.string().optional(),
  sellingPrice: z.coerce.number().min(0, "Must be 0 or more"),
  costPrice: z.coerce.number().min(0, "Must be 0 or more"),
  taxRate: z.coerce.number().min(0).max(100),
  lowStockAlert: z.coerce.number().min(0, "Must be 0 or more"),
  notes: z.string().optional(),
  openingStock: z.coerce.number().min(0, "Must be 0 or more").optional(),
});
type FormValues = z.infer<typeof schema>;

interface BomRow {
  key: string;
  rawMaterialId: string;
  qtyRequired: string;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new product. */
  product?: Product;
  /** Fires after a successful save with the saved row's id/name/cost — lets a picker (e.g. in a Purchase Bill) auto-select what was just created. */
  onSaved?: (product: { id: string; name: string; costPrice?: number }) => void;
}) {
  const { data: user } = useCurrentUser();
  const { data: rawMaterials } = useRawMaterials();
  const saveProduct = useSaveProduct();
  const isEdit = !!product;

  const [bomRows, setBomRows] = useState<BomRow[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { name: "", sku: "", category: "", sellingPrice: 0, costPrice: 0, taxRate: 5, lowStockAlert: 0, notes: "", openingStock: 0 },
  });

  useEffect(() => {
    if (!open) return;
    if (product) {
      reset({
        name: product.name,
        sku: product.sku,
        category: product.category,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        taxRate: product.taxRate,
        lowStockAlert: product.lowStockAlert,
        notes: product.notes,
        openingStock: 0,
      });
      setBomRows(product.bom.map((b) => ({ key: b.id, rawMaterialId: b.rawMaterialId, qtyRequired: String(b.qtyRequired) })));
    } else {
      reset({ name: "", sku: "", category: "", sellingPrice: 0, costPrice: 0, taxRate: 5, lowStockAlert: 0, notes: "", openingStock: 0 });
      setBomRows([]);
    }
  }, [open, product, reset]);

  function handleClose() {
    onOpenChange(false);
  }

  function addBomRow() {
    setBomRows((rows) => [...rows, { key: `new-${Date.now()}-${rows.length}`, rawMaterialId: "", qtyRequired: "" }]);
  }

  function updateBomRow(key: string, patch: Partial<BomRow>) {
    setBomRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeBomRow(key: string) {
    setBomRows((rows) => rows.filter((r) => r.key !== key));
  }

  async function onSubmit(values: FormValues) {
    try {
      const saved = await saveProduct.mutateAsync({
        id: product?.id,
        name: values.name,
        sku: values.sku,
        category: values.category || "",
        sellingPrice: values.sellingPrice,
        costPrice: values.costPrice,
        taxRate: values.taxRate,
        lowStockAlert: values.lowStockAlert,
        notes: values.notes || "",
        bom: bomRows.filter((r) => r.rawMaterialId).map((r) => ({ rawMaterialId: r.rawMaterialId, qtyRequired: parseFloat(r.qtyRequired) || 0 })),
        openingStock: isEdit ? undefined : values.openingStock,
        barcode: product?.barcode || undefined,
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Product updated" : "Product added");
      onSaved?.({ id: saved.id, name: saved.name, costPrice: values.costPrice });
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save product");
    }
  }

  const materialLabel = (id: string) => (rawMaterials || []).find((m) => m.id === id)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="size-4" /> {isEdit ? "Edit product" : "Add product"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as never)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name *" error={errors.name?.message}>
                  <Input placeholder="e.g. Men's Suit" {...register("name")} />
                </Field>
                <Field label="SKU *" error={errors.sku?.message}>
                  <Input placeholder="e.g. SUIT-001" {...register("sku")} />
                </Field>
                <Field label="Category">
                  <Input placeholder="e.g. Formalwear" {...register("category")} />
                </Field>
                <Field label="Tax rate (%)" error={errors.taxRate?.message}>
                  <Input type="number" min={0} max={100} step="0.01" {...register("taxRate")} />
                </Field>
              </div>
              {isEdit && product?.barcode && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Barcode</p>
                    <p className="font-mono text-sm">{product.barcode}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => printBarcodeLabel({ name: product.name, sku: product.sku, barcode: product.barcode, sellingPrice: product.sellingPrice })}>
                    <Printer className="size-3.5" /> Print label
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing & stock</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Selling price (₹)" error={errors.sellingPrice?.message}>
                  <Input type="number" min={0} step="0.01" {...register("sellingPrice")} />
                </Field>
                <Field label="Cost price (₹)" error={errors.costPrice?.message}>
                  <Input type="number" min={0} step="0.01" placeholder="Optional — for margin tracking" {...register("costPrice")} />
                </Field>
                <Field label="Low stock alert" error={errors.lowStockAlert?.message}>
                  <Input type="number" min={0} step="0.01" {...register("lowStockAlert")} />
                </Field>
                {!isEdit && (
                  <Field label="Opening stock" error={errors.openingStock?.message}>
                    <Input type="number" min={0} step="0.01" placeholder="0" {...register("openingStock")} />
                  </Field>
                )}
              </div>
              <Field label="Notes">
                <Textarea placeholder="Optional notes…" rows={2} {...register("notes")} />
              </Field>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListTree className="size-3.5" /> Bill of materials
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addBomRow}>
                  <Plus className="size-3.5" /> Add material
                </Button>
              </div>

              {bomRows.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  No materials linked yet. Add the raw materials one unit of this product consumes.
                </p>
              ) : (
                <div className="space-y-2">
                  {bomRows.map((row) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <Select value={row.rawMaterialId} onValueChange={(v) => v && updateBomRow(row.key, { rawMaterialId: v })}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select material…">{materialLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(rawMaterials || []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.unitName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        placeholder="Qty"
                        className="w-24"
                        value={row.qtyRequired}
                        onChange={(e) => updateBomRow(row.key, { qtyRequired: e.target.value })}
                      />
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeBomRow(row.key)} aria-label="Remove material">
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <DialogFooter className="mx-0 mb-0 border-t px-5 py-3 shrink-0">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
