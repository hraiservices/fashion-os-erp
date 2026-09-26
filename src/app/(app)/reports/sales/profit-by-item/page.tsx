"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

type ProfitByItemRow = { productId: string; productName: string; qty: number; revenue: number; cost: number; margin: number; marginPct: number };

const SORT_COMPARATORS: Record<string, (a: ProfitByItemRow, b: ProfitByItemRow) => number> = {
  product: (a, b) => a.productName.localeCompare(b.productName),
  qty: (a, b) => a.qty - b.qty,
  revenue: (a, b) => a.revenue - b.revenue,
  cost: (a, b) => a.cost - b.cost,
  margin: (a, b) => a.margin - b.margin,
  marginPct: (a, b) => a.marginPct - b.marginPct,
};
const SORT_DESC_KEYS = new Set(["qty", "revenue", "cost", "margin", "marginPct"]);

/** Product-only — margin/cost only exists for Product Sales; stitching orders have no product cost price to compare against. */
export default function ProfitByItemPage() {
  const { data: user } = useCurrentUser();
  const { data: invoices, isLoading: l1 } = useSalesInvoices();
  const { data: products, isLoading: l2 } = useProducts();
  const isLoading = l1 || l2;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [category, setCategory] = useState("all");

  const costPriceById = useMemo(() => new Map((products || []).map((p) => [p.id, p.costPrice])), [products]);
  const categoryById = useMemo(() => new Map((products || []).map((p) => [p.id, p.category])), [products]);
  const categories = useMemo(() => {
    const set = new Set((products || []).map((p) => p.category).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const rows = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; qty: number; revenue: number }>();
    (invoices || []).filter((inv) => isWithinDateRange(inv.invoiceDate, range)).forEach((inv) => {
      inv.items
        .filter((item) => category === "all" || categoryById.get(item.productId) === category)
        .forEach((item) => {
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
  }, [invoices, costPriceById, categoryById, range, category]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, margin: acc.margin + r.margin }), { revenue: 0, cost: 0, margin: 0 }), [rows]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ProfitByItemRow>("sales-profit-by-item", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  // Profit/margin figures are restricted to the admin role specifically, everywhere in the app.
  if (user && user.role !== "admin") {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={TrendingUp} title="No access" description="Profit by item is restricted to admins." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Profit by Item"
      description="Revenue, cost, and margin per product — from Product Sales invoices, using each product's cost price."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ Product: r.productName, "Qty sold": r.qty, Revenue: r.revenue, Cost: r.cost, Margin: r.margin, "Margin %": r.marginPct.toFixed(1) }))}
          filename="profit-by-item"
          title="Profit by Item"
          summaryLines={[`Revenue: ${inr(totals.revenue)}`, `Cost: ${inr(totals.cost)}`, `Margin: ${inr(totals.margin)}`]}
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        category={
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{category === "all" ? "All Categories" : category}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

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
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="product" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Product</Th>
                  <Th align="right" sortKey="qty" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Qty sold</Th>
                  <Th align="right" sortKey="revenue" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Revenue</Th>
                  <Th align="right" sortKey="cost" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Cost</Th>
                  <Th align="right" sortKey="margin" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Margin</Th>
                  <Th align="right" sortKey="marginPct" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Margin %</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.qty, 0)}</Td>
                  <Td align="right">{inr(totals.revenue)}</Td>
                  <Td align="right">{inr(totals.cost)}</Td>
                  <Td align="right">{inr(totals.margin)}</Td>
                  <Td align="right">{totals.revenue > 0 ? `${Math.round((totals.margin / totals.revenue) * 100)}%` : "0%"}</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
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
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totals.margin)} valueClassName={totals.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} showChevron={false} />
              <MobileRecordRow label="Qty sold" value={rows.reduce((s, r) => s + r.qty, 0)} />
              <MobileRecordRow label="Revenue" value={inr(totals.revenue)} />
              <MobileRecordRow label="Cost" value={inr(totals.cost)} />
              <MobileRecordRow label="Margin %" value={totals.revenue > 0 ? `${Math.round((totals.margin / totals.revenue) * 100)}%` : "0%"} />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.productId || r.productName}>
                <MobileRecordHeader
                  title={r.productName}
                  value={inr(r.margin)}
                  valueClassName={r.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                  showChevron={false}
                />
                <MobileRecordRow label="Qty sold" value={r.qty} />
                <MobileRecordRow label="Revenue" value={inr(r.revenue)} />
                <MobileRecordRow label="Cost" value={inr(r.cost)} valueClassName="text-muted-foreground" />
                <MobileRecordRow label="Margin %" value={`${r.marginPct.toFixed(1)}%`} valueClassName="text-muted-foreground" />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
