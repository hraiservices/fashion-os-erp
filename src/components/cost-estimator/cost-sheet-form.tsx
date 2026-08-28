"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  genSheetNo,
  computeTotals,
  newLineItem,
  newTailorLineItem,
  type LineItem,
  type TailorLineItem,
  type ProfitConfig,
} from "@/lib/cost-sheet";
import { useSaveCostSheet } from "@/hooks/use-cost-sheet-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { CostSheetWithItems } from "@/hooks/use-cost-sheet";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { ArrowLeft, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { printReport } from "@/lib/export";

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function LineItemsEditor({
  title,
  items,
  onChange,
  showQtyUnit = true,
}: {
  title: string;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  showQtyUnit?: boolean;
}) {
  function update(i: number, patch: Partial<LineItem>) {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    if (patch.quantity !== undefined || patch.rate !== undefined) {
      next[i].amount = (next[i].quantity || 0) * (next[i].rate || 0);
    }
    onChange(next);
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, newLineItem()])}>
          + Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, i) => (
          <div key={item.id} className="grid grid-cols-12 items-center gap-2">
            <Input className="col-span-4" placeholder="Item name" value={item.expense_name} onChange={(e) => update(i, { expense_name: e.target.value })} />
            {showQtyUnit && (
              <>
                <NumberInput className="col-span-2" min={0} placeholder="Qty" value={item.quantity} onChange={(v) => update(i, { quantity: v })} />
                <Input className="col-span-2" placeholder="Unit" value={item.unit} onChange={(e) => update(i, { unit: e.target.value })} />
              </>
            )}
            <NumberInput
              className={showQtyUnit ? "col-span-2" : "col-span-5"}
              min={0}
              placeholder="Rate"
              value={item.rate}
              onChange={(v) => update(i, { rate: v })}
            />
            <div className="col-span-1 text-right text-sm">{inr(item.amount)}</div>
            <Button type="button" variant="ghost" size="sm" className="col-span-1" onClick={() => items.length > 1 && onChange(items.filter((_, j) => j !== i))}><X className="size-4" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CostSheetForm({ existing }: { existing?: CostSheetWithItems }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const saveCostSheet = useSaveCostSheet();

  const [sheetNo] = useState(existing?.cost_sheet_no || genSheetNo());
  const [date, setDate] = useState(existing?.date || new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState(existing?.customer_name || "");
  const [customerMobile, setCustomerMobile] = useState(existing?.customer_mobile || "");
  const [productName, setProductName] = useState(existing?.product_name || "");
  const [category, setCategory] = useState(existing?.category || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [materials, setMaterials] = useState<LineItem[]>(existing?.materials.length ? existing.materials : [newLineItem()]);
  const [tailors, setTailors] = useState<TailorLineItem[]>(existing?.tailors.length ? existing.tailors : [newTailorLineItem()]);
  const [overheads, setOverheads] = useState<LineItem[]>(
    existing?.overheads.length ? existing.overheads : [newLineItem({ expense_name: "Electricity", unit: "Fixed" })]
  );
  const [profit, setProfit] = useState<ProfitConfig>({
    mode: (existing?.profit_mode as ProfitConfig["mode"]) || "percent",
    amount: existing?.profit_amount || 0,
    percent: existing?.profit_percent || 20,
  });

  const totals = computeTotals(materials, tailors, overheads, profit);

  async function save(status: "draft" | "final") {
    if (!productName) {
      toast.error("Product name is required");
      return;
    }
    try {
      const res = await saveCostSheet.mutateAsync({
        id: existing?.id,
        cost_sheet_no: sheetNo,
        date,
        customer_name: customerName,
        customer_mobile: customerMobile,
        product_name: productName,
        category,
        notes,
        status,
        materials,
        tailors,
        overheads,
        profit,
        userEmail: user?.email,
      });
      toast.success(existing ? "Cost sheet updated" : "Cost sheet saved");
      router.push(`/cost-estimator/${res.id}/edit`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save cost sheet");
    }
  }

  function print() {
    const matRows = materials.map((m) => `<tr><td>${m.expense_name || ""}</td><td>${m.quantity || 0} ${m.unit || ""}</td><td>₹${m.rate || 0}</td><td>₹${m.amount || 0}</td></tr>`).join("");
    const tlRows = tailors.map((t) => `<tr><td colspan='3'>${t.tailor_name || ""}</td><td>₹${t.tailor_charge || 0}</td></tr>`).join("");
    const ovRows = overheads.map((o) => `<tr><td>${o.expense_name || ""}</td><td>${o.quantity || 0} ${o.unit || ""}</td><td>₹${o.rate || 0}</td><td>₹${o.amount || 0}</td></tr>`).join("");
    printReport(
      `Cost Sheet - ${sheetNo}`,
      `<h3>${productName}</h3><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${matRows}${tlRows}${ovRows}</tbody></table>` +
        `<div class="summary"><table><tr><td>Total Expense</td><td>${inr(totals.totalExpense)}</td></tr><tr><td>Profit</td><td>${inr(totals.profitAmount)}</td></tr><tr class="final"><td>Final Price</td><td>${inr(totals.finalPrice)}</td></tr></table></div>`
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/cost-estimator" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Cost sheets</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{existing ? "Edit Cost Sheet" : "New Cost Sheet"}</h1>
            <p className="text-[11px] font-mono text-muted-foreground">{sheetNo}</p>
          </div>
          {/* Duplicate of the bottom FormActionBar — mobile only, so Save is reachable
             without scrolling all the way down. */}
          <div className="flex items-center gap-2 sm:hidden">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={saveCostSheet.isPending}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={saveCostSheet.isPending} onClick={() => save("final")}>
              {saveCostSheet.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{sheetNo}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Product name</Label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Customer name (optional)</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Customer mobile (optional)</Label>
            <Input value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <LineItemsEditor title="Materials" items={materials} onChange={setMaterials} />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Tailor charges</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setTailors([...tailors, newTailorLineItem()])}>
            + Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {tailors.map((t, i) => (
            <div key={t.id} className="grid grid-cols-12 items-center gap-2">
              <Input
                className="col-span-8"
                placeholder="Tailor name"
                value={t.tailor_name}
                onChange={(e) => {
                  const next = tailors.slice();
                  next[i] = { ...next[i], tailor_name: e.target.value };
                  setTailors(next);
                }}
              />
              <NumberInput
                className="col-span-3"
                min={0}
                placeholder="Charge"
                value={t.tailor_charge}
                onChange={(v) => {
                  const next = tailors.slice();
                  next[i] = { ...next[i], tailor_charge: v };
                  setTailors(next);
                }}
              />
              <Button type="button" variant="ghost" size="sm" className="col-span-1" onClick={() => tailors.length > 1 && setTailors(tailors.filter((_, j) => j !== i))}><X className="size-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <LineItemsEditor title="Overheads" items={overheads} onChange={setOverheads} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profit</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={profit.mode} onValueChange={(v) => v && setProfit({ ...profit, mode: v as ProfitConfig["mode"] })}>
              <SelectTrigger className="w-36">
                <SelectValue>{(v) => (v === "amount" ? "Fixed amount" : "Percent")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent</SelectItem>
                <SelectItem value="amount">Fixed amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {profit.mode === "percent" ? (
            <div className="space-y-2">
              <Label>Percent</Label>
              <NumberInput min={0} value={profit.percent} onChange={(v) => setProfit({ ...profit, percent: v })} className="w-32" />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Amount</Label>
              <NumberInput min={0} value={profit.amount} onChange={(v) => setProfit({ ...profit, amount: v })} className="w-32" />
            </div>
          )}
          <div className="ml-auto space-y-1 text-right">
            <div className="text-xs uppercase text-muted-foreground">Total Expense</div>
            <div className="text-lg">{inr(totals.totalExpense)}</div>
          </div>
          <div className="space-y-1 text-right">
            <div className="text-xs uppercase text-muted-foreground">Final Price</div>
            <div className="text-2xl font-light">{inr(totals.finalPrice)}</div>
          </div>
        </CardContent>
      </Card>
      </div>

      <FormActionBar className="flex-wrap justify-start sm:flex-nowrap sm:justify-end">
        <Button
          variant="outline"
          size="lg"
          className="h-12 px-5 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]"
          onClick={print}
        >
          Print
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 px-5 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]"
          disabled={saveCostSheet.isPending}
          onClick={() => save("draft")}
        >
          Save draft
        </Button>
        <Button
          size="lg"
          className="h-12 flex-1 px-5 text-base sm:h-7 sm:flex-none sm:px-2.5 sm:text-[0.8rem]"
          disabled={saveCostSheet.isPending}
          onClick={() => save("final")}
        >
          Save final
        </Button>
      </FormActionBar>
    </div>
  );
}
