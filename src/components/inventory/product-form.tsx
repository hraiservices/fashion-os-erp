"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, X, ListTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveProduct } from "@/hooks/use-inventory-mutations";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useCurrentUser } from "@/hooks/use-current-user";
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

export function ProductForm({ existing }: { existing?: Product }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: rawMaterials } = useRawMaterials();
  const saveProduct = useSaveProduct();
  const isEdit = !!existing;

  const [bomRows, setBomRows] = useState<BomRow[]>(existing ? existing.bom.map((b) => ({ key: b.id, rawMaterialId: b.rawMaterialId, qtyRequired: String(b.qtyRequired) })) : []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: existing
      ? {
          name: existing.name,
          sku: existing.sku,
          category: existing.category,
          sellingPrice: existing.sellingPrice,
          costPrice: existing.costPrice,
          taxRate: existing.taxRate,
          lowStockAlert: existing.lowStockAlert,
          notes: existing.notes,
          openingStock: 0,
        }
      : { name: "", sku: "", category: "", sellingPrice: 0, costPrice: 0, taxRate: 5, lowStockAlert: 0, notes: "", openingStock: 0 },
  });

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
        id: existing?.id,
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
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Product updated" : "Product added");
      router.push(isEdit ? "/inventory/products" : `/inventory/products?highlight=${saved.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save product");
    }
  }

  const materialLabel = (id: string) => (rawMaterials || []).find((m) => m.id === id)?.name ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{isEdit ? `Edit product · ${existing!.name}` : "New product"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit as never)}>
        <CardContent className="space-y-5">
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
        </CardContent>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add product"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
