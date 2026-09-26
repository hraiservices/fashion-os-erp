"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getSeasonalTrends } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

type SeasonalTrendRow = { month: string; label: string; count: number; revenue: number; avgOrderVal: number; growth: number };

const SORT_COMPARATORS: Record<string, (a: SeasonalTrendRow, b: SeasonalTrendRow) => number> = {
  month: (a, b) => a.month.localeCompare(b.month),
  orders: (a, b) => a.count - b.count,
  revenue: (a, b) => a.revenue - b.revenue,
  avgOrder: (a, b) => a.avgOrderVal - b.avgOrderVal,
  growth: (a, b) => a.growth - b.growth,
};
const SORT_DESC_KEYS = new Set(["orders", "revenue", "avgOrder", "growth"]);

/** The month buckets themselves are always the trailing 12 months (see getSeasonalTrends) — the
 *  date range narrows which orders count toward each bucket's revenue, not the window of months
 *  shown. */
export default function SeasonalTrendsPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [garmentType, setGarmentType] = useState("all");

  const garmentTypes = useMemo(() => {
    const set = new Set(orders.flatMap((o) => o.garments.map((g) => g.type)).filter(Boolean));
    return Array.from(set).sort();
  }, [orders]);

  const seasonal = useMemo(
    () =>
      getSeasonalTrends(
        orders
          .filter((o) => isWithinDateRange(o.inDate, range))
          .filter((o) => garmentType === "all" || o.garments.some((g) => g.type === garmentType))
      ),
    [orders, range, garmentType]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<SeasonalTrendRow>("seasonal-trends", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(seasonal);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  const totalOrders = seasonal.reduce((s, m) => s + m.count, 0);
  const totalRevenue = seasonal.reduce((s, m) => s + m.revenue, 0);

  return (
    <ReportShell
      title="Seasonal Trends"
      description="Revenue and order volume across the last 12 months"
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((m) => ({ Month: m.label, Orders: m.count, Revenue: m.revenue, "Avg order": m.avgOrderVal, "Growth %": `${m.growth}%` }))}
          filename="seasonal-trends"
          title="Seasonal Trends"
          summaryLines={[`Total orders: ${totalOrders}`, `Total revenue: ${inr(totalRevenue)}`]}
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
          <Select value={garmentType} onValueChange={(v) => v && setGarmentType(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{garmentType === "all" ? "All Garment Types" : garmentType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Garment Types</SelectItem>
              {garmentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <ReportCard className="p-4">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seasonal} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                formatter={(v) => inr(Number(v))}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0EA5E9" strokeWidth={2} fill="#0EA5E9" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="month" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Month</Th>
              <Th align="right" sortKey="orders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
              <Th align="right" sortKey="revenue" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Revenue</Th>
              <Th align="right" sortKey="avgOrder" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Avg order</Th>
              <Th align="right" sortKey="growth" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Growth</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{totalOrders}</Td>
              <Td align="right">{inr(totalRevenue)}</Td>
              <Td align="right">{totalOrders > 0 ? inr(Math.round(totalRevenue / totalOrders)) : "—"}</Td>
              <Td align="right">—</Td>
            </ReportTotalsRow>
            {sortedRows.map((m) => {
              const Icon = m.growth > 0 ? TrendingUp : m.growth < 0 ? TrendingDown : Minus;
              const tone = m.growth > 0 ? "text-emerald-600 dark:text-emerald-400" : m.growth < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
              return (
                <tr key={m.month} className="hover:bg-muted/30">
                  <Td className="font-medium">{m.label}</Td>
                  <Td align="right">{m.count}</Td>
                  <Td align="right">{inr(m.revenue)}</Td>
                  <Td align="right">{inr(m.avgOrderVal)}</Td>
                  <Td align="right">
                    <span className={`inline-flex items-center justify-end gap-1 ${tone}`}>
                      <Icon className="size-3.5" />
                      {m.growth}%
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </ReportTable>
      </div>
      <MobileRecordList>
        <MobileRecordCard className="bg-muted/40">
          <MobileRecordHeader title="Total" value={inr(totalRevenue)} showChevron={false} />
          <MobileRecordRow label="Orders" value={totalOrders} />
          <MobileRecordRow label="Avg order" value={totalOrders > 0 ? inr(Math.round(totalRevenue / totalOrders)) : "—"} />
          <MobileRecordRow label="Growth" value="—" />
        </MobileRecordCard>
        {sortedRows.map((m) => {
          const Icon = m.growth > 0 ? TrendingUp : m.growth < 0 ? TrendingDown : Minus;
          const tone = m.growth > 0 ? "text-emerald-600 dark:text-emerald-400" : m.growth < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
          return (
            <MobileRecordCard key={m.month}>
              <MobileRecordHeader title={m.label} value={inr(m.revenue)} showChevron={false} />
              <MobileRecordRow label="Orders" value={m.count} />
              <MobileRecordRow label="Avg order" value={inr(m.avgOrderVal)} />
              <MobileRecordRow
                label="Growth"
                value={
                  <span className={`inline-flex items-center gap-1 ${tone}`}>
                    <Icon className="size-3.5" />
                    {m.growth}%
                  </span>
                }
              />
            </MobileRecordCard>
          );
        })}
      </MobileRecordList>
    </ReportShell>
  );
}
