"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProducts } from "@/hooks/use-products";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useActiveTailorNames } from "@/hooks/use-employees";
import { useCreateWorkOrder, useUpdateWorkOrder } from "@/hooks/use-work-order-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genWoNumber, prefillMaterialsFromBom, type WorkOrderMaterial } from "@/lib/manufacturing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import type { WorkOrder } from "@/lib/types";

export function WorkOrderForm({ existing }: { existing?: WorkOrder }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const { data: rawMaterials } = useRawMaterials();
  const { data: tailors } = useActiveTailorNames();
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

  // Skips exactly one BOM-recompute — the initial mount when editing — so the existing
  // (possibly manually adjusted) material list isn't clobbered before the user changes anything.
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
    // Only re-derive when product or qty changes — user edits to individual rows shouldn't be wiped by unrelated renders.
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
          userEmail: user?.email,
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
          userEmail: user?.email,
        });
        toast.success(`Work order ${woNumber} created`);
        router.push(`/manufacturing/${res.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save work order");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">{isEdit ? `Edit work order · ${woNumber}` : `New work order · ${woNumber}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Product *</Label>
              <Select value={productId} onValueChange={(v) => v && setProductId(v)}>
                <SelectTrigger className="w-full">
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Qty to produce *</Label>
              <Input type="number" min={1} step="1" value={qtyToProduce} onChange={(e) => setQtyToProduce(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tailor *</Label>
              {(tailors || []).length > 0 ? (
                <Select value={tailor} onValueChange={(v) => v && setTailor(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Assign a tailor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tailors || []).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={tailor} onChange={(e) => setTailor(e.target.value)} placeholder="Add tailors in Employees" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Labor cost per piece (₹)</Label>
              <Input type="number" min={0} step="0.01" value={laborCostPerPiece} onChange={(e) => setLaborCostPerPiece(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {product && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Materials required (from Bill of Materials × qty)</Label>
              {materials.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
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
                              <Input
                                type="number"
                                min={0}
                                step="0.001"
                                className="w-24 text-right"
                                value={m.qtyPlanned}
                                onChange={(e) => updateMaterialQty(m.rawMaterialId, parseFloat(e.target.value) || 0)}
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

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea rows={2} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Estimated cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Material cost</span>
                <span className="tabular-nums">{inr(estMaterialCost)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Labor cost</span>
                <span className="tabular-nums">{inr(estLaborCost)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{inr(estTotalCost)}</span>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Create work order"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
