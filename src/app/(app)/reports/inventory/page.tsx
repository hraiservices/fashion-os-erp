"use client";

import { useMemo } from "react";
import { Package, Boxes, ShoppingBag, AlertTriangle } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange } from "@/lib/report-date-range";

/** Pure point-in-time stock/valuation snapshot — raw materials and products carry no date field
 *  at all (current stockQty/cost only), so there is no underlying transaction for a date range to
 *  filter. The bar is shown anyway for consistency with every other report; it has no effect here. */
export default function InventoryReportPage() {
  const { data: rawMaterials, isLoading: loadingMaterials } = useRawMaterials();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const isLoading = loadingMaterials || loadingProducts;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo } = useReportDateRange();

  const rawValue = useMemo(() => (rawMaterials || []).reduce((s, m) => s + m.stockQty * m.costPerUnit, 0), [rawMaterials]);
  // "Inventory Value" is cost-basis (what you paid) — the accounting-correct figure for a
  // balance sheet, insurance claim, or loan application. Retail value (what you'd get if you
  // sold every unit today) is a different, larger number, shown separately so the two aren't
  // conflated the way a single "value at selling price" figure previously did.
  const finishedCostValue = useMemo(() => (products || []).reduce((s, p) => s + p.stockQty * p.costPrice, 0), [products]);
  const finishedRetailValue = useMemo(() => (products || []).reduce((s, p) => s + p.stockQty * p.sellingPrice, 0), [products]);
  const lowStockCount = useMemo(
    () => (rawMaterials || []).filter((m) => isLowStock(m.stockQty, m.lowStockAlert)).length + (products || []).filter((p) => isLowStock(p.stockQty, p.lowStockAlert)).length,
    [rawMaterials, products]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Inventory Valuation" description="Stock on hand valued at cost (accounting basis) and at retail, across raw materials and finished goods">
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Raw Materials" value={rawMaterials?.length ?? 0} icon={Package} />
        <StatCard label="Products" value={products?.length ?? 0} icon={ShoppingBag} />
        <StatCard label="Inventory Value (cost)" value={inr(rawValue + finishedCostValue)} icon={Boxes} />
        <StatCard label="Retail Value (finished goods)" value={inr(finishedRetailValue)} icon={Boxes} />
        <StatCard label="Low Stock Items" value={lowStockCount} icon={AlertTriangle} tone={lowStockCount > 0 ? "warning" : "default"} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Raw materials</h2>
        {!rawMaterials || rawMaterials.length === 0 ? (
          <EmptyState icon={Package} title="No raw materials yet" />
        ) : (
          <ReportTable>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Cost/unit</Th>
                <Th align="right">Value</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rawMaterials.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <Td className="font-medium">{m.name}</Td>
                  <Td>{m.category || "—"}</Td>
                  <Td align="right" className={isLowStock(m.stockQty, m.lowStockAlert) ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                    {m.stockQty} {m.unitName}
                  </Td>
                  <Td align="right">{inr(m.costPerUnit)}</Td>
                  <Td align="right">{inr(m.stockQty * m.costPerUnit)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2.5" colSpan={4}>
                  Total raw material value
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(rawValue)}</td>
              </tr>
            </tfoot>
          </ReportTable>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Finished goods</h2>
        {!products || products.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No products yet" />
        ) : (
          <ReportTable>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Name</Th>
                <Th>SKU</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Cost price</Th>
                <Th align="right">Cost value</Th>
                <Th align="right">Selling price</Th>
                <Th align="right">Retail value</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <Td className="font-medium">{p.name}</Td>
                  <Td>{p.sku}</Td>
                  <Td align="right" className={isLowStock(p.stockQty, p.lowStockAlert) ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                    {p.stockQty} pcs
                  </Td>
                  <Td align="right">{inr(p.costPrice)}</Td>
                  <Td align="right">{inr(p.stockQty * p.costPrice)}</Td>
                  <Td align="right">{inr(p.sellingPrice)}</Td>
                  <Td align="right">{inr(p.stockQty * p.sellingPrice)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2.5" colSpan={4}>
                  Total finished-goods value
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(finishedCostValue)}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(finishedRetailValue)}</td>
              </tr>
            </tfoot>
          </ReportTable>
        )}
      </div>
    </ReportShell>
  );
}
