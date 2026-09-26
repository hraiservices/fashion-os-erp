"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { getStaffEfficiency } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

type StaffEfficiencyRow = { tailor: string; total: number; revenue: number; revPerOrder: number; efficiency: number };

const SORT_COMPARATORS: Record<string, (a: StaffEfficiencyRow, b: StaffEfficiencyRow) => number> = {
  orders: (a, b) => a.total - b.total,
  revenue: (a, b) => a.revenue - b.revenue,
  perOrder: (a, b) => a.revPerOrder - b.revPerOrder,
  efficiency: (a, b) => a.efficiency - b.efficiency,
};
const SORT_DESC_KEYS = new Set(["orders", "revenue", "perOrder", "efficiency"]);

export default function StaffEfficiencyPage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [garmentType, setGarmentType] = useState("all");

  const sortComparators = useMemo<Record<string, (a: StaffEfficiencyRow, b: StaffEfficiencyRow) => number>>(
    () => ({ ...SORT_COMPARATORS, tailor: (a, b) => tailorName(a.tailor).localeCompare(tailorName(b.tailor)) }),
    [tailorName]
  );

  const garmentTypes = useMemo(() => {
    const set = new Set(orders.flatMap((o) => o.garments.map((g) => g.type)).filter(Boolean));
    return Array.from(set).sort();
  }, [orders]);

  const staffEff = useMemo(
    () =>
      getStaffEfficiency(
        orders
          .filter((o) => isWithinDateRange(o.inDate, range))
          .filter((o) => garmentType === "all" || o.garments.some((g) => g.type === garmentType))
      ),
    [orders, range, garmentType]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<StaffEfficiencyRow>("staff-efficiency", sortComparators, SORT_DESC_KEYS);
  const sortedRows = applySort(staffEff);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalOrders = staffEff.reduce((s, t) => s + t.total, 0);
  const totalRevenue = staffEff.reduce((s, t) => s + t.revenue, 0);

  return (
    <ReportShell
      title="Staff Efficiency"
      description="Revenue per order and on-time delivery rate"
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((t) => ({ Tailor: tailorName(t.tailor), Orders: t.total, Revenue: t.revenue, "Per order": t.revPerOrder, "Efficiency %": `${t.efficiency}%` }))}
          filename="staff-efficiency"
          title="Staff Efficiency"
          summaryLines={[`Orders: ${totalOrders}`, `Total revenue: ${inr(totalRevenue)}`]}
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

      {staffEff.length === 0 ? (
        <EmptyState icon={Users} title="No staff data yet" description="Assign tailors to orders to see efficiency here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="tailor" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Tailor</Th>
                  <Th align="right" sortKey="orders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
                  <Th align="right" sortKey="revenue" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Revenue</Th>
                  <Th align="right" sortKey="perOrder" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Per order</Th>
                  <Th sortKey="efficiency" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Efficiency</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{totalOrders}</Td>
                  <Td align="right">{inr(totalRevenue)}</Td>
                  <Td align="right">{totalOrders > 0 ? inr(Math.round(totalRevenue / totalOrders)) : "—"}</Td>
                  <Td>—</Td>
                </ReportTotalsRow>
                {sortedRows.map((t) => (
                  <tr key={t.tailor} className="hover:bg-muted/30">
                    <Td className="font-medium">{tailorName(t.tailor)}</Td>
                    <Td align="right">{t.total}</Td>
                    <Td align="right">{inr(t.revenue)}</Td>
                    <Td align="right">{inr(t.revPerOrder)}</Td>
                    <Td>
                      <div className="flex min-w-24 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${t.efficiency >= 90 ? "bg-emerald-500" : t.efficiency >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${t.efficiency}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{t.efficiency}%</span>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totalRevenue)} showChevron={false} />
              <MobileRecordRow label="Orders" value={totalOrders} />
              <MobileRecordRow label="Per order" value={totalOrders > 0 ? inr(Math.round(totalRevenue / totalOrders)) : "—"} />
            </MobileRecordCard>
            {sortedRows.map((t) => (
              <MobileRecordCard key={t.tailor}>
                <MobileRecordHeader title={tailorName(t.tailor)} value={inr(t.revenue)} showChevron={false} />
                <MobileRecordRow label="Orders" value={t.total} />
                <MobileRecordRow label="Per order" value={inr(t.revPerOrder)} />
                <MobileRecordRow
                  label="Efficiency"
                  value={
                    <div className="flex min-w-20 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${t.efficiency >= 90 ? "bg-emerald-500" : t.efficiency >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${t.efficiency}%` }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{t.efficiency}%</span>
                    </div>
                  }
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
