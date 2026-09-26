"use client";

import { useMemo, useState } from "react";
import { Shirt } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getGarmentStats } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";
import type { GarmentStat } from "@/lib/analytics";

const SORT_COMPARATORS: Record<string, (a: GarmentStat, b: GarmentStat) => number> = {
  type: (a, b) => a.type.localeCompare(b.type),
  orders: (a, b) => a.orders - b.orders,
  count: (a, b) => a.count - b.count,
  rev: (a, b) => a.rev - b.rev,
};
const SORT_DESC_KEYS = new Set(["orders", "count", "rev"]);

/** Garment-type performance: which garment types bring the most orders, quantity and revenue
 *  over a period — the number every "what should we push more of" conversation starts from. */
export default function GarmentAnalysisPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [tailor, setTailor] = useState("all");

  const dateFilteredOrders = useMemo(() => orders.filter((o) => isWithinDateRange(o.inDate, range)), [orders, range]);
  const tailors = useMemo(() => Array.from(new Set(dateFilteredOrders.map((o) => o.tailor).filter(Boolean))).sort(), [dateFilteredOrders]);
  const garStats = useMemo(
    () => getGarmentStats(dateFilteredOrders.filter((o) => tailor === "all" || o.tailor === tailor)),
    [dateFilteredOrders, tailor]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<GarmentStat>("garment-analysis", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedStats = applySort(garStats);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const maxCount = Math.max(...garStats.map((g) => g.count), 1);
  const totalCount = garStats.reduce((s, g) => s + g.count, 0);
  const totalOrders = garStats.reduce((s, g) => s + g.orders, 0);
  const totalRev = garStats.reduce((s, g) => s + g.rev, 0);
  const exportRows = sortedStats.map((g) => ({
    "Garment type": g.type,
    Orders: g.orders,
    "Qty stitched": g.count,
    Revenue: g.rev,
    "Share of revenue": totalRev > 0 ? `${Math.round((g.rev / totalRev) * 100)}%` : "0%",
  }));

  return (
    <ReportShell
      title="Garment Analysis"
      description="Which garment types you stitch most, and what they're worth"
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="garment-analysis"
          title="Garment Analysis"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Total revenue: ${inr(totalRev)}`, `Total qty: ${totalCount}`]}
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
          <Select value={tailor} onValueChange={(v) => v && setTailor(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{tailor === "all" ? "All Tailors" : tailor}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tailors</SelectItem>
              {tailors.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {garStats.length === 0 ? (
        <EmptyState icon={Shirt} title="No garment data yet" />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(totalRev)} showChevron={false} />
            <MobileRecordRow label="Orders" value={totalOrders} />
            <MobileRecordRow label="Qty" value={totalCount} />
            <MobileRecordRow label="% of revenue" value="100%" />
          </MobileRecordCard>
          {sortedStats.map((g) => (
            <MobileRecordCard key={g.type}>
              <MobileRecordHeader
                title={g.type}
                value={inr(g.rev)}
                showChevron={false}
              />
              <MobileRecordRow label="Orders" value={g.orders} />
              <MobileRecordRow label="Qty" value={g.count} />
              <MobileRecordRow label="% of revenue" value={totalRev > 0 ? `${Math.round((g.rev / totalRev) * 100)}%` : "0%"} />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="type" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Garment</Th>
              <Th>Share</Th>
              <Th align="right" sortKey="orders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
              <Th align="right" sortKey="count" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Qty</Th>
              <Th align="right" sortKey="rev" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Revenue</Th>
              <Th align="right">% of revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td />
              <Td align="right">{totalOrders}</Td>
              <Td align="right">{totalCount}</Td>
              <Td align="right">{inr(totalRev)}</Td>
              <Td align="right">100%</Td>
            </ReportTotalsRow>
            {sortedStats.map((g) => (
              <tr key={g.type} className="hover:bg-muted/30">
                <Td className="font-medium">{g.type}</Td>
                <Td className="w-40">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                  </div>
                </Td>
                <Td align="right">{g.orders}</Td>
                <Td align="right">{g.count}</Td>
                <Td align="right">{inr(g.rev)}</Td>
                <Td align="right" className="text-muted-foreground">{totalRev > 0 ? `${Math.round((g.rev / totalRev) * 100)}%` : "0%"}</Td>
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
