"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitPicker } from "@/components/inventory/unit-picker";
import { useSaveRawMaterial } from "@/hooks/use-inventory-mutations";
import { useUnits } from "@/hooks/use-units";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { RawMaterial } from "@/lib/types";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  unitId: z.string().min(1, "Select a unit"),
  costPerUnit: z.coerce.number().min(0, "Must be 0 or more"),
  category: z.string().optional(),
  lowStockAlert: z.coerce.number().min(0, "Must be 0 or more"),
  notes: z.string().optional(),
  openingStock: z.coerce.number().min(0, "Must be 0 or more").optional(),
});
type FormValues = z.infer<typeof schema>;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function RawMaterialFormDialog({
  open,
  onOpenChange,
  material,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new raw material. */
  material?: RawMaterial;
  /** Fires after a successful save with the saved row's id/name/unit/cost — lets a picker (e.g. in a Purchase Bill) auto-select what was just created. */
  onSaved?: (material: { id: string; name: string; unitName?: string; costPerUnit?: number }) => void;
}) {
  const { data: user } = useCurrentUser();
  const { data: units } = useUnits();
  const saveMaterial = useSaveRawMaterial();
  const isEdit = !!material;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { name: "", unitId: "", costPerUnit: 0, category: "", lowStockAlert: 0, notes: "", openingStock: 0 },
  });

  useEffect(() => {
    if (open) {
      reset(
        material
          ? { name: material.name, unitId: material.unitId, costPerUnit: material.costPerUnit, category: material.category, lowStockAlert: material.lowStockAlert, notes: material.notes, openingStock: 0 }
          : { name: "", unitId: "", costPerUnit: 0, category: "", lowStockAlert: 0, notes: "", openingStock: 0 }
      );
    }
  }, [open, material, reset]);

  function handleClose() {
    onOpenChange(false);
  }

  async function onSubmit(values: FormValues) {
    try {
      const saved = await saveMaterial.mutateAsync({
        id: material?.id,
        name: values.name,
        unitId: values.unitId,
        costPerUnit: values.costPerUnit,
        category: values.category || "",
        lowStockAlert: values.lowStockAlert,
        notes: values.notes || "",
        openingStock: isEdit ? undefined : values.openingStock,
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Raw material updated" : "Raw material added");
      onSaved?.({ id: saved.id, name: saved.name, unitName: (units || []).find((u) => u.id === values.unitId)?.name, costPerUnit: values.costPerUnit });
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save raw material");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4" /> {isEdit ? "Edit raw material" : "Add raw material"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as never)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <section className="space-y-3">
              <Field label="Name *" error={errors.name?.message}>
                <Input placeholder="e.g. Cotton Fabric" {...register("name")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unit *" error={errors.unitId?.message}>
                  <Controller control={control} name="unitId" render={({ field }) => <UnitPicker value={field.value} onChange={field.onChange} />} />
                </Field>
                <Field label="Category">
                  <Input placeholder="e.g. Fabric" {...register("category")} />
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock & cost</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cost per unit (₹)" error={errors.costPerUnit?.message}>
                  <Controller control={control} name="costPerUnit" render={({ field }) => <NumberInput min={0} step="0.01" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
                </Field>
                <Field label="Low stock alert" error={errors.lowStockAlert?.message}>
                  <Controller control={control} name="lowStockAlert" render={({ field }) => <NumberInput min={0} step="0.01" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
                </Field>
              </div>
              {!isEdit && (
                <Field label="Opening stock" error={errors.openingStock?.message}>
                  <Controller control={control} name="openingStock" render={({ field }) => <NumberInput min={0} step="0.01" value={field.value ?? 0} onChange={field.onChange} onBlur={field.onBlur} />} />
                </Field>
              )}
            </section>

            <Field label="Notes">
              <Textarea placeholder="Optional notes…" rows={2} {...register("notes")} />
            </Field>
          </div>

          <DialogFooter className="mx-0 mb-0 border-t px-5 py-3 shrink-0">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add material"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
