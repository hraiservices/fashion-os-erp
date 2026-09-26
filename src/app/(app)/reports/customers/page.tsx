"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getCustomerLifetime } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { cn } from "@/lib/utils";
import { useTableSort } from "@/hooks/use-table-sort";

type CustomerLifetimeRow = {
  name: string;
  mobile: string;
  totalOrders: number;
  totalSpent: number;
  avgOrder: number;
  monthsActive: number;
  clvScore: number;
};

const SORT_COMPARATORS: Record<string, (a: CustomerLifetimeRow, b: CustomerLifetimeRow) => number> = {
  customer: (a, b) => a.name.localeCompare(b.name),
  mobile: (a, b) => a.mobile.localeCompare(b.mobile),
  orders: (a, b) => a.totalOrders - b.totalOrders,
  spent: (a, b) => a.totalSpent - b.totalSpent,
  avgOrder: (a, b) => a.avgOrder - b.avgOrder,
  months: (a, b) => a.monthsActive - b.monthsActive,
  clvScore: (a, b) => a.clvScore - b.clvScore,
};
const SORT_DESC_KEYS = new Set(["orders", "spent", "avgOrder", "months", "clvScore"]);

type SegmentFilter = "all" | "repeat" | "one-time";
const SEGMENT_FILTERS: { value: SegmentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "repeat", label: "Repeat" },
  { value: "one-time", label: "One-time" },
];

function CustomerSegmentFilter({ value, onChange }: { value: SegmentFilter; onChange: (v: SegmentFilter) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by customer segment">
      {SEGMENT_FILTERS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ReportsView's `clvData`, Stitching_Manager_Pro_v16.html ~line 8071. The date range filters
 *  which orders (by inDate) feed each customer's lifetime totals — this is inherently a
 *  cumulative-to-date metric, so a range narrows the window the "lifetime" is computed over. */
export default function CustomerLifetimePage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [segment, setSegment] = useState<SegmentFilter>("all");

  const clvDataAll = useMemo(() => getCustomerLifetime(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);
  const clvData = useMemo(
    () => clvDataAll.filter((c) => (segment === "repeat" ? c.totalOrders > 1 : segment === "one-time" ? c.totalOrders <= 1 : true)),
    [clvDataAll, segment]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<CustomerLifetimeRow>("customer-lifetime", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedClvData = applySort(clvData);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Customer Lifetime"
      description="Ranked by lifetime value (repeat customers weighted higher)"
      actions={
        <ReportActionsMenu
          rows={sortedClvData.map((c) => ({
            Name: c.name,
            Mobile: c.mobile,
            Orders: c.totalOrders,
            Spent: c.totalSpent,
            AvgOrder: c.avgOrder,
            MonthsActive: c.monthsActive,
            CLVScore: c.clvScore,
          }))}
          filename="customer-lifetime"
          title="Customer Lifetime"
          summaryLines={[`Customers: ${clvData.length}`, `Total spent: ${inr(clvData.reduce((s, c) => s + c.totalSpent, 0))}`]}
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
        category={<CustomerSegmentFilter value={segment} onChange={setSegment} />}
      />

      {clvData.length === 0 ? (
        <EmptyState icon={Users} title="No customer data yet" />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th align="right" sortKey="orders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
                  <Th align="right" sortKey="spent" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Spent</Th>
                  <Th align="right" sortKey="avgOrder" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Avg order</Th>
                  <Th align="right" sortKey="months" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Months</Th>
                  <Th align="right" sortKey="clvScore" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>CLV score</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={2}>Total</Td>
                  <Td align="right">{clvData.reduce((s, c) => s + c.totalOrders, 0)}</Td>
                  <Td align="right">{inr(clvData.reduce((s, c) => s + c.totalSpent, 0))}</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {sortedClvData.map((c) => (
                  <tr key={c.mobile} className="hover:bg-muted/30">
                    <Td>
                      <p className="truncate font-medium">{c.name}</p>
                    </Td>
                    <Td className="text-muted-foreground">{c.mobile}</Td>
                    <Td align="right">{c.totalOrders}</Td>
                    <Td align="right">{inr(c.totalSpent)}</Td>
                    <Td align="right">{inr(c.avgOrder)}</Td>
                    <Td align="right">{c.monthsActive}</Td>
                    <Td align="right" className="font-semibold">
                      {c.clvScore}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" showChevron={false} />
              <MobileRecordGrid
                items={[
                  { label: "Orders", value: clvData.reduce((s, c) => s + c.totalOrders, 0) },
                  { label: "Spent", value: inr(clvData.reduce((s, c) => s + c.totalSpent, 0)) },
                ]}
              />
            </MobileRecordCard>
            {sortedClvData.map((c) => (
              <MobileRecordCard key={c.mobile}>
                <MobileRecordHeader title={c.name} value={c.clvScore} showChevron={false} />
                <MobileRecordRow label="Mobile" value={c.mobile} />
                <MobileRecordGrid
                  items={[
                    { label: "Orders", value: c.totalOrders },
                    { label: "Spent", value: inr(c.totalSpent) },
                    { label: "Avg order", value: inr(c.avgOrder) },
                    { label: "Months", value: c.monthsActive },
                  ]}
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
