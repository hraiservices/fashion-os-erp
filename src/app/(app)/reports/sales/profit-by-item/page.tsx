"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/** Product-only — margin/cost only exists for Product Sales; stitching orders have no product cost price to compare against. */
export default function ProfitByItemPage() {
  const { data: invoices, isLoading: l1 } = useSalesInvoices();
  const { data: products, isLoading: l2 } = useProducts();
  const isLoading = l1 || l2;

  const costPriceById = useMemo(() => new Map((products || []).map((p) => [p.id, p.costPrice])), [products]);

  const rows = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; qty: number; revenue: number }>();
    (invoices || []).forEach((inv) => {
      inv.items.forEach((item) => {
        const row = map.get(item.productId) || { productId: item.productId, productName: item.productName, qty: 0, revenue: 0 };
        row.qty += item.qty;
        row.revenue += item.amount;
        map.set(item.productId, row);
      });
    });
    return Array.from(map.values())
      .map((r) => {
        const cost = r.qty * (costPriceById.get(r.productId) || 0);
        const margin = r.revenue - cost;
        return { ...r, cost, margin, marginPct: r.revenue > 0 ? (margin / r.revenue) * 100 : 0 };
      })
      .sort((a, b) => b.margin - a.margin);
  }, [invoices, costPriceById]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, margin: acc.margin + r.margin }), { revenue: 0, cost: 0, margin: 0 }), [rows]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Profit by Item"
      description="Revenue, cost, and margin per product — from Product Sales invoices, using each product's cost price."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((r) => ({ Product: r.productName, "Qty sold": r.qty, Revenue: r.revenue, Cost: r.cost, Margin: r.margin, "Margin %": r.marginPct.toFixed(1) }))}
            filename="profit_by_item"
          />
        )
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Revenue" value={inr(totals.revenue)} icon={TrendingUp} />
        <StatCard label="Cost" value={inr(totals.cost)} icon={TrendingUp} />
        <StatCard
          label="Margin"
          value={inr(totals.margin)}
          icon={TrendingUp}
          hint={totals.revenue > 0 ? `${Math.round((totals.margin / totals.revenue) * 100)}% of revenue` : undefined}
          tone={totals.margin >= 0 ? "success" : "danger"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No product sales yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Product</Th>
              <Th align="right">Qty sold</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Cost</Th>
              <Th align="right">Margin</Th>
              <Th align="right">Margin %</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.productId || r.productName} className="hover:bg-muted/30">
                <Td className="font-medium">{r.productName}</Td>
                <Td align="right">{r.qty}</Td>
                <Td align="right">{inr(r.revenue)}</Td>
                <Td align="right" className="text-muted-foreground">{inr(r.cost)}</Td>
                <Td align="right" className={r.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {inr(r.margin)}
                </Td>
                <Td align="right" className="text-muted-foreground">{r.marginPct.toFixed(1)}%</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
