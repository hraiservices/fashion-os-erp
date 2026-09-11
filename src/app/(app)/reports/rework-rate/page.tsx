"use client";

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { getReworkRate } from "@/lib/analytics";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

/** Rework rate per tailor — driven entirely by the manually-set rework flag (order detail
 *  page's "Flag for rework" action), not an automatic quality signal. */
export default function ReworkRatePage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const reworkRate = useMemo(() => getReworkRate(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalOrders = reworkRate.reduce((s, r) => s + r.totalOrders, 0);
  const totalRework = reworkRate.reduce((s, r) => s + r.reworkCount, 0);

  return (
    <ReportShell
      title="Rework Rate"
      description="Share of each tailor's orders flagged for rework"
      actions={
        <ReportActionsMenu
          rows={reworkRate.map((r) => ({ Tailor: tailorName(r.tailor), "Total orders": r.totalOrders, "Rework count": r.reworkCount, "Rework rate": `${r.reworkRate}%` }))}
          filename="rework-rate"
          title="Rework Rate"
          summaryLines={[`Total orders: ${totalOrders}`, `Total rework: ${totalRework}`]}
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
      />

      {reworkRate.length === 0 ? (
        <EmptyState icon={RotateCcw} title="No data yet" description="Assign orders to tailors to see this breakdown." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={`${totalOrders ? Math.round((totalRework / totalOrders) * 100) : 0}%`} showChevron={false} />
              <MobileRecordRow label="Total orders" value={totalOrders} />
              <MobileRecordRow label="Rework count" value={totalRework} />
            </MobileRecordCard>
            {reworkRate.map((r) => (
              <MobileRecordCard key={r.tailor}>
                <MobileRecordHeader
                  title={tailorName(r.tailor)}
                  value={`${r.reworkRate}%`}
                  valueClassName={r.reworkRate >= 15 ? "font-medium text-destructive" : undefined}
                  showChevron={false}
                />
                <MobileRecordRow label="Total orders" value={r.totalOrders} />
                <MobileRecordRow label="Rework count" value={r.reworkCount} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Tailor</Th>
                  <Th align="right">Total orders</Th>
                  <Th align="right">Rework count</Th>
                  <Th align="right">Rework rate</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{totalOrders}</Td>
                  <Td align="right">{totalRework}</Td>
                  <Td align="right">{totalOrders ? Math.round((totalRework / totalOrders) * 100) : 0}%</Td>
                </ReportTotalsRow>
                {reworkRate.map((r) => (
                  <tr key={r.tailor} className="hover:bg-muted/30">
                    <Td className="font-medium">{tailorName(r.tailor)}</Td>
                    <Td align="right">{r.totalOrders}</Td>
                    <Td align="right">{r.reworkCount}</Td>
                    <Td align="right" className={r.reworkRate >= 15 ? "font-medium text-destructive" : undefined}>
                      {r.reworkRate}%
                    </Td>
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
