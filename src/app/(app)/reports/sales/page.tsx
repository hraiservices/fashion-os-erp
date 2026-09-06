"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Receipt, Wallet, TrendingUp, ChevronRight, Users, Clock, FileMinus } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/lib/format";
import { buildUnifiedSales, filterByType, type SaleTypeFilter } from "@/lib/unified-sales";
import { ReportShell } from "@/components/reports/report-shell";
import { SalesTypeFilter } from "@/components/reports/sales-type-filter";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

const DESCRIPTIONS: Record<SaleTypeFilter, string> = {
  all: "Total revenue across Stitching Orders and Product Sales, combined.",
  stitching: "Revenue from custom stitching orders only.",
  retail: "Revenue from product/retail invoices only.",
};

const SUB_REPORTS = [
  { href: "/reports/sales/by-customer", label: "Sales by Customer", description: "Revenue ranked per customer", icon: Users },
  { href: "/reports/sales/by-item", label: "Sales by Item", description: "Qty sold and revenue per product", icon: ShoppingBag },
  { href: "/reports/sales/profit-by-item", label: "Profit by Item", description: "Cost and margin per product", icon: TrendingUp },
  { href: "/sales/payments", label: "Payments Received", description: "Every payment logged against an invoice", icon: Wallet },
  { href: "/reports/sales/time-to-get-paid", label: "Time to Get Paid", description: "Days from invoice to payment", icon: Clock },
  { href: "/reports/sales/credit-notes", label: "Credit Note Details", description: "Credit notes issued per invoice", icon: FileMinus },
];

export default function SalesSummaryPage() {
  const { data: user } = useCurrentUser();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();
  const [filter, setFilter] = useState<SaleTypeFilter>("all");
  // Profit by Item is restricted to the admin role specifically — hide the link itself, not
  // just the destination page.
  const subReports = user?.role === "admin" ? SUB_REPORTS : SUB_REPORTS.filter((r) => r.href !== "/reports/sales/profit-by-item");

  const isLoading = ordersLoading || invoicesLoading;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const filtered = useMemo(
    () => filterByType(buildUnifiedSales(orders || [], invoices || []), filter).filter((t) => isWithinDateRange(t.date, range)),
    [orders, invoices, filter, range]
  );

  const totalBilled = useMemo(() => filtered.reduce((s, t) => s + t.billed, 0), [filtered]);
  const totalCollected = useMemo(() => filtered.reduce((s, t) => s + t.paid, 0), [filtered]);
  const totalReceivable = useMemo(() => filtered.reduce((s, t) => s + t.balance, 0), [filtered]);
  const collectionPct = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  // GST only applies to retail invoices — always computed from the retail slice, regardless of the active filter.
  const totalGst = useMemo(
    () => (invoices || []).filter((i) => isWithinDateRange(i.invoiceDate, range)).reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0),
    [invoices, range]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Sales Summary" description={DESCRIPTIONS[filter]}>
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        category={<SalesTypeFilter value={filter} onChange={setFilter} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Billed" value={inr(totalBilled)} icon={Receipt} />
        <StatCard label="Collected" value={inr(totalCollected)} icon={TrendingUp} hint={`${collectionPct}% of billed`} />
        <StatCard label="Receivable" value={inr(totalReceivable)} icon={Wallet} tone={totalReceivable > 0 ? "warning" : "default"} />
        <StatCard label="GST Collected" value={inr(totalGst)} icon={ShoppingBag} hint={filter === "stitching" ? "N/A for stitching orders" : undefined} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Detailed reports</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {subReports.map((r) => (
            <Link key={r.href} href={r.href} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <r.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.label}</p>
                <p className="truncate text-xs text-muted-foreground">{r.description}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </ReportShell>
  );
}
