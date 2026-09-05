"use client";

import { useMemo } from "react";
import { ShoppingBag, Info } from "lucide-react";
import Link from "next/link";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** Product-only — stitching orders aren't broken down by product/item, only by garment type (see Garment Analysis). */
export default function SalesByItemPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; qty: number; revenue: number; orders: number }>();
    (invoices || []).filter((inv) => isWithinDateRange(inv.invoiceDate, range)).forEach((inv) => {
      inv.items.forEach((item) => {
        const row = map.get(item.productId) || { productId: item.productId, productName: item.productName, qty: 0, revenue: 0, orders: 0 };
        row.qty += item.qty;
        row.revenue += item.amount;
        row.orders += 1;
        map.set(item.productId, row);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [invoices, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Sales by Item"
      description="Quantity sold and revenue per product, from Product Sales invoices."
      actions={
        rows.length > 0 && (
          <ExportMenu rows={rows.map((r) => ({ Product: r.productName, "Qty sold": r.qty, Invoices: r.orders, Revenue: r.revenue }))} filename="sales_by_item" />
        )
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
      />

      {rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No product sales yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Product</Th>
              <Th align="right">Qty sold</Th>
              <Th align="right">Invoices</Th>
              <Th align="right">Revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.productId || r.productName} className="hover:bg-muted/30">
                <Td className="font-medium">{r.productName}</Td>
                <Td align="right">{r.qty}</Td>
                <Td align="right">{r.orders}</Td>
                <Td align="right">{inr(r.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
