"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Package2, Tag, ListTree, Plus, X, Save, Shirt, ImagePlus, PackagePlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveProduct } from "@/hooks/use-inventory-mutations";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useCurrentUser } from "@/hooks/use-current-user";
import { fileToDataUrl } from "@/lib/image-utils";
import { PRODUCT_SIZES, PRODUCT_COLORS, PRODUCT_FABRICS, PRODUCT_PATTERNS, PRODUCT_OCCASIONS } from "@/lib/product-attributes";
import { ProductCustomerMatches } from "@/components/inventory/product-customer-matches";
import { ProductStockAdjustmentDialog } from "@/components/inventory/product-stock-adjustment-dialog";
import type { Product } from "@/lib/types";

const UNTAGGED = "__untagged__";
const untaggedLabel = (v: unknown) => (v === UNTAGGED ? "Not set" : (v as string));

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
  size: z.string(),
  color: z.string(),
  fabric: z.string(),
  pattern: z.string(),
  occasion: z.string(),
  brand: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface BomRow {
  key: string;
  rawMaterialId: string;
  qtyRequired: string;
}

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

export function ProductForm({ existing }: { existing?: Product }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: rawMaterials } = useRawMaterials();
  const saveProduct = useSaveProduct();
  const isEdit = !!existing;

  const [bomRows, setBomRows] = useState<BomRow[]>(existing ? existing.bom.map((b) => ({ key: b.id, rawMaterialId: b.rawMaterialId, qtyRequired: String(b.qtyRequired) })) : []);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(existing?.imageDataUrl ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: existing
      ? {
          name: existing.name, sku: existing.sku, category: existing.category, sellingPrice: existing.sellingPrice, costPrice: existing.costPrice,
          taxRate: existing.taxRate, lowStockAlert: existing.lowStockAlert, notes: existing.notes, openingStock: 0,
          size: existing.size || UNTAGGED, color: existing.color || UNTAGGED, fabric: existing.fabric || UNTAGGED,
          pattern: existing.pattern || UNTAGGED, occasion: existing.occasion || UNTAGGED, brand: existing.brand,
        }
      : { name: "", sku: "", category: "", sellingPrice: 0, costPrice: 0, taxRate: 5, lowStockAlert: 0, notes: "", openingStock: 0, size: UNTAGGED, color: UNTAGGED, fabric: UNTAGGED, pattern: UNTAGGED, occasion: UNTAGGED, brand: "" },
  });

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    try {
      setImageDataUrl(await fileToDataUrl(file, 800));
    } catch {
      toast.error("Could not read image");
    } finally {
      setUploadingImage(false);
    }
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
        size: values.size === UNTAGGED ? "" : values.size,
        color: values.color === UNTAGGED ? "" : values.color,
        fabric: values.fabric === UNTAGGED ? "" : values.fabric,
        pattern: values.pattern === UNTAGGED ? "" : values.pattern,
        occasion: values.occasion === UNTAGGED ? "" : values.occasion,
        brand: values.brand || "",
        imageDataUrl,
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
    <form onSubmit={handleSubmit(onSubmit as never)} className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/inventory/products" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Products</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Product" : "New Product"}</h1>
            {isEdit && <p className="text-[11px] font-mono text-muted-foreground">{existing!.sku}</p>}
          </div>
          {isEdit && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setStockDialogOpen(true)}>
              <PackagePlus className="size-3.5" /> <span className="hidden sm:inline">Adjust Stock</span>
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        {/* Product info */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Package2} label="Product info" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Product name" required error={errors.name?.message}>
              <Input placeholder="e.g. Men's Suit" className="h-10" {...register("name")} />
            </FieldGroup>
            <FieldGroup label="SKU" required error={errors.sku?.message} hint="Unique identifier for this product.">
              <Input placeholder="e.g. SUIT-001" className="h-10" {...register("sku")} />
            </FieldGroup>
            <FieldGroup label="Category">
              <Input placeholder="e.g. Formalwear, Ethnic" className="h-10" {...register("category")} />
            </FieldGroup>
            <FieldGroup label="Tax rate (%)" error={errors.taxRate?.message}>
              <Controller control={control} name="taxRate" render={({ field }) => <NumberInput min={0} max={100} step={0.01} className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FieldGroup>
          </div>
        </div>

        {/* Style & attributes */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Shirt} label="Style & attributes" />
          <p className="-mt-2 mb-4 text-xs text-muted-foreground">
            Helps the app suggest this product to the right customers based on what they've bought before.
          </p>

          <div className="mb-4 flex items-center gap-3">
            {imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageDataUrl} alt="Product" className="h-20 w-20 rounded-lg border object-cover bg-white" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                <ImagePlus className="size-6" />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={uploadingImage} nativeButton={false} render={<label className="cursor-pointer" />}>
                {uploadingImage ? "Uploading…" : imageDataUrl ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
              </Button>
              {imageDataUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setImageDataUrl(null)}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Size">
              <Controller
                control={control}
                name="size"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{untaggedLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNTAGGED}>Not set</SelectItem>
                      {PRODUCT_SIZES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            <FieldGroup label="Color">
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{untaggedLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNTAGGED}>Not set</SelectItem>
                      {PRODUCT_COLORS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            <FieldGroup label="Fabric">
              <Controller
                control={control}
                name="fabric"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{untaggedLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNTAGGED}>Not set</SelectItem>
                      {PRODUCT_FABRICS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            <FieldGroup label="Pattern / style">
              <Controller
                control={control}
                name="pattern"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{untaggedLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNTAGGED}>Not set</SelectItem>
                      {PRODUCT_PATTERNS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            <FieldGroup label="Occasion">
              <Controller
                control={control}
                name="occasion"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{untaggedLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNTAGGED}>Not set</SelectItem>
                      {PRODUCT_OCCASIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            <FieldGroup label="Brand" hint="Optional — vendor or brand name.">
              <Input placeholder="e.g. Fabindia" className="h-10" {...register("brand")} />
            </FieldGroup>
          </div>
        </div>

        {/* Pricing & stock */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Tag} label="Pricing & stock" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Selling price (₹)" required error={errors.sellingPrice?.message}>
              <Controller control={control} name="sellingPrice" render={({ field }) => <NumberInput min={0} step={0.01} className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FieldGroup>
            <FieldGroup label="Cost price (₹)" error={errors.costPrice?.message} hint="Optional — for margin tracking.">
              <Controller control={control} name="costPrice" render={({ field }) => <NumberInput min={0} step={0.01} className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FieldGroup>
            <FieldGroup label="Low stock alert" hint="Notify when stock falls below this.">
              <Controller control={control} name="lowStockAlert" render={({ field }) => <NumberInput min={0} step={0.01} className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </FieldGroup>
            {!isEdit && (
              <FieldGroup label="Opening stock" error={errors.openingStock?.message} hint="Current stock on hand.">
                <Controller control={control} name="openingStock" render={({ field }) => <NumberInput min={0} step={0.01} placeholder="0" className="h-10" value={field.value ?? 0} onChange={field.onChange} onBlur={field.onBlur} />} />
              </FieldGroup>
            )}
          </div>
          <div className="mt-4">
            <FieldGroup label="Notes">
              <Textarea placeholder="Optional notes…" rows={2} className="resize-none" {...register("notes")} />
            </FieldGroup>
          </div>
        </div>

        {/* Bill of materials */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 border-b pb-2 flex-1">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <ListTree className="size-3.5 text-primary" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bill of materials</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addBomRow} className="ml-3 shrink-0">
              <Plus className="size-3.5 mr-1" /> Add material
            </Button>
          </div>

          {bomRows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No materials linked yet. Add the raw materials one unit of this product consumes during manufacturing.
            </p>
          ) : (
            <div className="space-y-2">
              {bomRows.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <Select value={row.rawMaterialId} onValueChange={(v) => v && updateBomRow(row.key, { rawMaterialId: v })}>
                    <SelectTrigger className="flex-1 h-10">
                      <SelectValue placeholder="Select material…">{materialLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(rawMaterials || []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} ({m.unitName})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Qty"
                    className="w-24 h-10"
                    value={row.qtyRequired}
                    onChange={(e) => updateBomRow(row.key, { qtyRequired: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" className="size-9 sm:size-7 shrink-0" onClick={() => removeBomRow(row.key)} aria-label="Remove">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isEdit && <ProductCustomerMatches product={existing} />}
      </div>
      {isEdit && <ProductStockAdjustmentDialog product={existing} open={stockDialogOpen} onOpenChange={setStockDialogOpen} />}

      <FormActionBar>
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" size="sm" className="gap-1.5" disabled={isSubmitting}>
          <Save className="size-3.5" />
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Product"}
        </Button>
      </FormActionBar>
    </form>
  );
}
