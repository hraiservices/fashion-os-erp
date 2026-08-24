"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Settings2, CalendarDays, Layers, FileText, Factory } from "lucide-react";
import Link from "next/link";
import { useProducts } from "@/hooks/use-products";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useActiveTailors } from "@/hooks/use-employees";
import { useCreateWorkOrder, useUpdateWorkOrder } from "@/hooks/use-work-order-mutations";
import { genWoNumber, prefillMaterialsFromBom, type WorkOrderMaterial } from "@/lib/manufacturing";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { inr } from "@/lib/format";
import type { WorkOrder } from "@/lib/types";

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

function FieldGroup({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function WorkOrderForm({ existing }: { existing?: WorkOrder }) {
  const router = useRouter();
  const { data: products } = useProducts();
  const { data: rawMaterials } = useRawMaterials();
  const { data: tailors } = useActiveTailors();
  const createWo = useCreateWorkOrder();
  const updateWo = useUpdateWorkOrder();
  const isEdit = !!existing;
  const isPending = createWo.isPending || updateWo.isPending;

  const [woNumber] = useState(existing?.woNumber || genWoNumber());
  const [productId, setProductId] = useState(existing?.productId || "");
  const [qtyToProduce, setQtyToProduce] = useState(String(existing?.qtyToProduce ?? 1));
  const [tailor, setTailor] = useState(existing?.tailor || "");
  const [startDate, setStartDate] = useState(existing?.startDate || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(existing?.dueDate || "");
  const [laborCostPerPiece, setLaborCostPerPiece] = useState(String(existing?.laborCostPerPiece ?? 0));
  const [notes, setNotes] = useState(existing?.notes || "");
  const [materials, setMaterials] = useState<WorkOrderMaterial[]>(existing?.materials || []);

  const skipNextRecompute = useRef(!!existing);

  const product = (products || []).find((p) => p.id === productId);
  const productLabel = (id: string) => (products || []).find((p) => p.id === id)?.name ?? "";

  const costByMaterialId = useMemo(() => new Map((rawMaterials || []).map((m) => [m.id, m.costPerUnit])), [rawMaterials]);

  useEffect(() => {
    if (skipNextRecompute.current) {
      skipNextRecompute.current = false;
      return;
    }
    if (!product) {
      setMaterials([]);
      return;
    }
    const qty = parseFloat(qtyToProduce) || 0;
    setMaterials(prefillMaterialsFromBom(product.bom, qty, costByMaterialId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, qtyToProduce]);

  function updateMaterialQty(rawMaterialId: string, qtyPlanned: number) {
    setMaterials((rows) => rows.map((r) => (r.rawMaterialId === rawMaterialId ? { ...r, qtyPlanned } : r)));
  }

  const qty = parseFloat(qtyToProduce) || 0;
  const estMaterialCost = materials.reduce((s, m) => s + m.qtyPlanned * (costByMaterialId.get(m.rawMaterialId) ?? 0), 0);
  const estLaborCost = qty * (parseFloat(laborCostPerPiece) || 0);
  const estTotalCost = estMaterialCost + estLaborCost;

  async function handleSave() {
    if (!productId) return toast.error("Select a product");
    const qty = parseFloat(qtyToProduce) || 0;
    if (qty <= 0) return toast.error("Enter a quantity to produce");
    if (!tailor) return toast.error("Assign a tailor");

    try {
      if (isEdit) {
        await updateWo.mutateAsync({
          id: existing!.id,
          woNumber,
          productId,
          productName: product?.name || "",
          qtyToProduce: qty,
          tailor,
          startDate,
          dueDate: dueDate || null,
          materials,
          laborCostPerPiece: parseFloat(laborCostPerPiece) || 0,
          notes,
        });
        toast.success(`Work order ${woNumber} updated`);
        router.push(`/manufacturing/${existing!.id}`);
      } else {
        const res = await createWo.mutateAsync({
          woNumber,
          productId,
          productName: product?.name || "",
          qtyToProduce: qty,
          tailor,
          startDate,
          dueDate: dueDate || null,
          materials,
          laborCostPerPiece: parseFloat(laborCostPerPiece) || 0,
          notes,
        });
        toast.success(`Work order ${woNumber} created`);
        router.push(`/manufacturing/${res.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save work order");
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/manufacturing" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Work orders</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Work Order" : "New Work Order"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{woNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()} disabled={isPending}>Cancel</Button>
            <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={handleSave} disabled={isPending}>
              <Factory className="size-3.5" />
              {isPending ? "Saving…" : isEdit ? `Save Changes · ${inr(estTotalCost)}` : `Create WO · ${inr(estTotalCost)}`}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Product & production */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Settings2} label="Product & production" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Product to produce" required>
                <Select value={productId} onValueChange={(v) => v && setProductId(v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Select product…">{productLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(products || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.bom.length === 0 && "(no BOM set)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
              <FieldGroup label="Quantity to produce" required>
                <Input type="number" min={1} step="1" value={qtyToProduce} onChange={(e) => setQtyToProduce(e.target.value)} className="h-10" />
              </FieldGroup>
              <FieldGroup label="Labor cost per piece (₹)" hint="Per unit labor cost for payroll calculations.">
                <Input type="number" min={0} step="0.01" value={laborCostPerPiece} onChange={(e) => setLaborCostPerPiece(e.target.value)} className="h-10" />
              </FieldGroup>
            </div>
          </div>

          {/* Schedule & team */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={CalendarDays} label="Schedule & team" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Assigned tailor" required>
                {(tailors || []).length > 0 ? (
                  <Select value={tailor} onValueChange={(v) => v && setTailor(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Assign a tailor" />
                    </SelectTrigger>
                    <SelectContent>
                      {(tailors || []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  // No free-text fallback — whatever's typed here would be saved as an id and
                  // could never match any employee, permanently orphaning this WO's tailor
                  // attribution. Add the employee first instead.
                  <Input disabled placeholder="Add a tailor under Employees first" className="h-10" />
                )}
              </FieldGroup>
              <div /> {/* spacer for grid alignment */}
              <FieldGroup label="Start date">
                <DatePicker value={startDate} onChange={setStartDate} />
              </FieldGroup>
              <FieldGroup label="Due date">
                <DatePicker value={dueDate} onChange={setDueDate} />
              </FieldGroup>
            </div>
          </div>

          {/* Materials */}
          {product && (
            <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
              <SectionHeading icon={Layers} label="Materials required" />
              {materials.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  This product has no Bill of Materials set. Add one from Inventory → Products, or continue without material tracking.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th className="p-2 text-left font-medium">Material</th>
                        <th className="p-2 text-right font-medium">Planned qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {materials.map((m) => (
                        <tr key={m.rawMaterialId}>
                          <td className="p-2">{m.rawMaterialName}</td>
                          <td className="p-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <NumberInput
                                min={0}
                                step="0.001"
                                className="w-24 h-10 text-right"
                                value={m.qtyPlanned}
                                onChange={(v) => updateMaterialQty(m.rawMaterialId, v)}
                              />
                              <span className="text-xs text-muted-foreground">{m.unitName}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={FileText} label="Notes" />
            <FieldGroup label="Production notes">
              <Textarea rows={3} placeholder="Special instructions, quality standards, rush notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />
            </FieldGroup>
          </div>
        </div>

        {/* Cost sidebar */}
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[61px] space-y-4">
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="bg-primary px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Estimated cost</p>
              <p className="text-2xl font-bold text-primary-foreground tabular-nums">{inr(estTotalCost)}</p>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Material cost</span>
                <span className="tabular-nums">{inr(estMaterialCost)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Labor cost</span>
                <span className="tabular-nums">{inr(estLaborCost)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold text-base">
                <span>Total est. cost</span>
                <span className="tabular-nums">{inr(estTotalCost)}</span>
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <Button className="w-full h-10 gap-2" onClick={handleSave} disabled={isPending}>
                <Factory className="size-4" />
                {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Work Order"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
