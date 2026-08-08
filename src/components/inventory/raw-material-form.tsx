"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitPicker } from "@/components/inventory/unit-picker";
import { useSaveRawMaterial } from "@/hooks/use-inventory-mutations";
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

export function RawMaterialForm({ existing }: { existing?: RawMaterial }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const saveMaterial = useSaveRawMaterial();
  const isEdit = !!existing;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: existing
      ? { name: existing.name, unitId: existing.unitId, costPerUnit: existing.costPerUnit, category: existing.category, lowStockAlert: existing.lowStockAlert, notes: existing.notes, openingStock: 0 }
      : { name: "", unitId: "", costPerUnit: 0, category: "", lowStockAlert: 0, notes: "", openingStock: 0 },
  });

  async function onSubmit(values: FormValues) {
    try {
      await saveMaterial.mutateAsync({
        id: existing?.id,
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
      router.push("/inventory/raw-materials");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save raw material");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{isEdit ? `Edit raw material · ${existing!.name}` : "New raw material"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit as never)}>
        <CardContent className="space-y-5">
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
                <Input type="number" min={0} step="0.01" {...register("costPerUnit")} />
              </Field>
              <Field label="Low stock alert" error={errors.lowStockAlert?.message}>
                <Input type="number" min={0} step="0.01" {...register("lowStockAlert")} />
              </Field>
            </div>
            {!isEdit && (
              <Field label="Opening stock" error={errors.openingStock?.message}>
                <Input type="number" min={0} step="0.01" placeholder="0" {...register("openingStock")} />
              </Field>
            )}
          </section>

          <Field label="Notes">
            <Textarea placeholder="Optional notes…" rows={2} {...register("notes")} />
          </Field>
        </CardContent>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add material"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
