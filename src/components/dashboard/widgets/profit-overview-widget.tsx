"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, LineChart as LineChartIcon, Radio } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useExpenses } from "@/hooks/use-expenses";
import { useOrderExpenses } from "@/hooks/use-order-expenses";
import { useAllPayslips } from "@/hooks/use-payroll";
import { getCombinedDaily, getCombinedMonthly, type CombinedMonthStat } from "@/lib/combined-reports";
import type { ChartRange } from "@/lib/period-buckets";
import { inr, inrCompact } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { LegendDot, MoneyStat, useLiveRefresh } from "@/components/dashboard/widgets/chart-widget-kit";
import {
  ComposedChart, Bar, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

type ChartKind = "bar" | "line";

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "6m", label: "6 Months" },
];

const CHART_OPTIONS: { value: ChartKind; label: string; icon: typeof BarChart3 }[] = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: LineChartIcon },
];

const LIVE_QUERY_KEYS = [
  ["orders"], ["sales-invoices"], ["purchase-bills"], ["work-orders"], ["expenses"], ["order-expenses"], ["payslips", "all"],
];

export function ProfitOverviewWidget() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [range, setRange] = useState<ChartRange>("month");
  const [chartKind, setChartKind] = useState<ChartKind>("bar");

  const { data: orders, isLoading: l1 } = useOrders();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const { data: bills, isLoading: l3 } = usePurchaseBills();
  const { data: workOrders, isLoading: l4 } = useWorkOrders();
  const { data: expenses, isLoading: l5 } = useExpenses();
  const { data: orderExpenses, isLoading: l6 } = useOrderExpenses();
  const { data: payslips, isLoading: l7 } = useAllPayslips();
  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  useLiveRefresh(qc, LIVE_QUERY_KEYS);

  const data: CombinedMonthStat[] = useMemo(() => {
    if (!orders || !invoices || !bills || !workOrders || !expenses) return [];
    const oe = orderExpenses || [];
    const ps = payslips || [];
    if (range === "6m") return getCombinedMonthly(orders, invoices, bills, workOrders, expenses, oe, ps);
    const days = range === "week" ? 7 : new Date().getDate();
    return getCombinedDaily(orders, invoices, bills, workOrders, expenses, oe, ps, days);
  }, [orders, invoices, bills, workOrders, expenses, orderExpenses, payslips, range]);

  // Defense in depth — the dashboard page itself keeps this widget out of a non-admin/manager
  // layout entirely (see isWidgetVisibleForRole), so this should never actually render, but
  // profit numbers are sensitive enough that a silent no-op here beats a leak if that ever
  // changes without this file being updated too.
  if (user && user.role !== "admin" && user.role !== "manager") return null;

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const totals = data.reduce(
    (acc, d) => ({ revenue: acc.revenue + d.revenue, cost: acc.cost + d.totalCost, profit: acc.profit + d.netProfit }),
    { revenue: 0, cost: 0, profit: 0 }
  );
  const stitchingRevenueTotal = data.reduce((s, d) => s + d.stitchingRevenue, 0);
  const salesRevenueTotal = data.reduce((s, d) => s + d.salesRevenue, 0);

  return (
    <section className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Profit Overview</h2>
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Radio className="size-2.5 animate-pulse" /> Live
          </span>
        </div>
        <Link href="/reports/combined-pl" className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
          Full report <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-52 sm:w-auto">
          <SegmentedToggle value={range} onChange={setRange} options={RANGE_OPTIONS} ariaLabel="Time range" />
        </div>
        <div className="w-full max-w-36 sm:w-auto">
          <SegmentedToggle value={chartKind} onChange={setChartKind} options={CHART_OPTIONS} ariaLabel="Chart type" />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <MoneyStat label="Stitching Revenue" value={stitchingRevenueTotal} color="var(--color-foreground)" />
        <MoneyStat label="Sales Revenue" value={salesRevenueTotal} color="var(--color-foreground)" />
        <MoneyStat label="Expenses" value={totals.cost} color="#f97316" />
        <MoneyStat label="Profit" value={totals.profit} color={totals.profit >= 0 ? "#10b981" : "#ef4444"} />
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-4">
        <LegendDot color="#0ea5e9" label="Stitching Revenue" />
        <LegendDot color="#8b5cf6" label="Sales Revenue" />
        <LegendDot color="#f97316" label="Expenses" />
        <LegendDot color="#10b981" label="Profit" />
      </div>

      <div className="min-h-52 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickFormatter={(v) => inrCompact(v)} tickLine={false} axisLine={false} fontSize={10} />
            <Tooltip
              formatter={(v, name) => [inr(Number(v)), name]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
            />
            {chartKind === "bar" ? (
              <>
                <Bar dataKey="stitchingRevenue" name="Stitching Revenue" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={24} animationDuration={500} />
                <Bar dataKey="salesRevenue" name="Sales Revenue" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={24} animationDuration={500} />
                <Bar dataKey="totalCost" name="Expenses" fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={24} animationDuration={500} />
              </>
            ) : (
              <>
                <Line type="monotone" dataKey="stitchingRevenue" name="Stitching Revenue" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} animationDuration={500} />
                <Line type="monotone" dataKey="salesRevenue" name="Sales Revenue" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} animationDuration={500} />
                <Line type="monotone" dataKey="totalCost" name="Expenses" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} animationDuration={500} />
              </>
            )}
            <Line type="monotone" dataKey="netProfit" name="Profit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} animationDuration={500} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
