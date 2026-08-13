"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Layers, BarChart2, FileText, Save } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b pb-2 mb-4">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function FieldGroup({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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
    <form onSubmit={handleSubmit(onSubmit as never)} className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/inventory/raw-materials" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Raw materials</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Raw Material" : "New Raw Material"}</h1>
            {isEdit && <p className="text-[11px] font-mono text-muted-foreground">{existing!.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={isSubmitting}>
              <Save className="size-3.5" />
              {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Material"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        {/* Material info */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Layers} label="Material info" />
          <div className="space-y-4">
            <FieldGroup label="Material name" required error={errors.name?.message}>
              <Input placeholder="e.g. Cotton Fabric" className="h-10" {...register("name")} />
            </FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Unit" required error={errors.unitId?.message} hint="e.g. metres, kg, pieces">
                <Controller control={control} name="unitId" render={({ field }) => <UnitPicker value={field.value} onChange={field.onChange} />} />
              </FieldGroup>
              <FieldGroup label="Category">
                <Input placeholder="e.g. Fabric, Thread, Button" className="h-10" {...register("category")} />
              </FieldGroup>
            </div>
          </div>
        </div>

        {/* Stock & cost */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={BarChart2} label="Stock & cost" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Cost per unit (₹)" error={errors.costPerUnit?.message}>
              <Controller control={control} name="costPerUnit" render={({ field }) => <NumberInput min={0} step="0.01" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FieldGroup>
            <FieldGroup label="Low stock alert" hint="Get notified when stock falls below this.">
              <Controller control={control} name="lowStockAlert" render={({ field }) => <NumberInput min={0} step="0.01" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FieldGroup>
            {!isEdit && (
              <FieldGroup label="Opening stock" error={errors.openingStock?.message} hint="Current stock on hand when you add this item.">
                <Controller control={control} name="openingStock" render={({ field }) => <NumberInput min={0} step="0.01" value={field.value ?? 0} onChange={field.onChange} onBlur={field.onBlur} />} />
              </FieldGroup>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={FileText} label="Notes" />
          <FieldGroup label="Internal notes">
            <Textarea placeholder="Supplier info, quality notes, storage instructions…" rows={3} className="resize-none" {...register("notes")} />
          </FieldGroup>
        </div>
      </div>
    </form>
  );
}
