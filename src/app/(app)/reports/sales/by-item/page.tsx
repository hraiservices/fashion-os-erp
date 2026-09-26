"use client";

import { useMemo, useState } from "react";
import { ShoppingBag, Info } from "lucide-react";
import Link from "next/link";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

type ByItemRow = { productId: string; productName: string; qty: number; revenue: number; orders: number };

const SORT_COMPARATORS: Record<string, (a: ByItemRow, b: ByItemRow) => number> = {
  product: (a, b) => a.productName.localeCompare(b.productName),
  qty: (a, b) => a.qty - b.qty,
  orders: (a, b) => a.orders - b.orders,
  revenue: (a, b) => a.revenue - b.revenue,
};
const SORT_DESC_KEYS = new Set(["qty", "orders", "revenue"]);

/** Product-only — stitching orders aren't broken down by product/item, only by garment type (see Garment Analysis). */
export default function SalesByItemPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [product, setProduct] = useState("all");

  const products = useMemo(() => {
    const set = new Set((invoices || []).flatMap((inv) => inv.items.map((i) => i.productName)).filter(Boolean));
    return Array.from(set).sort();
  }, [invoices]);

  const rows = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; qty: number; revenue: number; orders: number }>();
    (invoices || []).filter((inv) => isWithinDateRange(inv.invoiceDate, range)).forEach((inv) => {
      inv.items.filter((item) => product === "all" || item.productName === product).forEach((item) => {
        const row = map.get(item.productId) || { productId: item.productId, productName: item.productName, qty: 0, revenue: 0, orders: 0 };
        row.qty += item.qty;
        row.revenue += item.amount;
        row.orders += 1;
        map.set(item.productId, row);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [invoices, range, product]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ByItemRow>("sales-by-item", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Sales by Item"
      description="Quantity sold and revenue per product, from Product Sales invoices."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ Product: r.productName, "Qty sold": r.qty, Invoices: r.orders, Revenue: r.revenue }))}
          filename="sales-by-item"
          title="Sales by Item"
          summaryLines={[`Products: ${rows.length}`, `Total revenue: ${inr(rows.reduce((s, r) => s + r.revenue, 0))}`]}
        />
      }
    >
      <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Product Sales only — stitching orders aren&apos;t itemized by product. See{" "}
          <Link href="/reports/garments" className="text-primary hover:underline">
            Garment Analysis
          </Link>{" "}
          for stitching order breakdowns.
        </span>
      </div>

      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} product${rows.length === 1 ? "" : "s"}`}
        category={
          <Select value={product} onValueChange={(v) => v && setProduct(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{product === "all" ? "All Products" : product}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No product sales yet" />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(rows.reduce((s, r) => s + r.revenue, 0))} showChevron={false} />
              <MobileRecordRow label="Qty sold" value={rows.reduce((s, r) => s + r.qty, 0)} />
              <MobileRecordRow label="Invoices" value={rows.reduce((s, r) => s + r.orders, 0)} />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.productId || r.productName}>
                <MobileRecordHeader title={r.productName} value={inr(r.revenue)} showChevron={false} />
                <MobileRecordRow label="Qty sold" value={r.qty} />
                <MobileRecordRow label="Invoices" value={r.orders} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="product" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Product</Th>
                  <Th align="right" sortKey="qty" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Qty sold</Th>
                  <Th align="right" sortKey="orders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Invoices</Th>
                  <Th align="right" sortKey="revenue" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Revenue</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.qty, 0)}</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.orders, 0)}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.revenue, 0))}</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
                  <tr key={r.productId || r.productName} className="hover:bg-muted/30">
                    <Td className="font-medium">{r.productName}</Td>
                    <Td align="right">{r.qty}</Td>
                    <Td align="right">{r.orders}</Td>
                    <Td align="right">{inr(r.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
        </>
      )}
    </ReportShell>
  );
}
