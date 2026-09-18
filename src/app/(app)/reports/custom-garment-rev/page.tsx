"use client";

import { useMemo } from "react";
import { Shirt } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getCustomGarmentRevenue } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/**
 * ReportsView's `customGarRev`, Stitching_Manager_Pro_v16.html ~line 8111. Rows show as
 * "Standard" until OrderForm collects a custom garment name — see the note in analytics.ts.
 */
export default function CustomGarmentRevPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const customGarRev = useMemo(() => getCustomGarmentRevenue(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalCount = customGarRev.reduce((s, g) => s + g.count, 0);
  const totalRevenue = customGarRev.reduce((s, g) => s + g.revenue, 0);

  return (
    <ReportShell
      title="Custom Garment Revenue"
      description="Revenue split between custom-named garments and standard rate-card types"
      actions={
        <ReportActionsMenu
          rows={customGarRev.map((g) => ({ Garment: g.label, Type: g.isCustom ? "Custom" : "Standard", Count: g.count, Revenue: g.revenue }))}
          filename="custom-garment-revenue"
          title="Custom Garment Revenue"
          summaryLines={[`Total revenue: ${inr(totalRevenue)}`]}
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

      {customGarRev.length === 0 ? (
        <EmptyState icon={Shirt} title="No garment revenue yet" />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Garment</Th>
                  <Th>Type</Th>
                  <Th align="right">Count</Th>
                  <Th align="right">Revenue</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={2}>Total</Td>
                  <Td align="right">{totalCount}</Td>
                  <Td align="right">{inr(totalRevenue)}</Td>
                </ReportTotalsRow>
                {customGarRev.map((g) => (
                  <tr key={g.label} className="hover:bg-muted/30">
                    <Td className="font-medium">{g.label}</Td>
                    <Td>
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          g.isCustom ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {g.isCustom ? "Custom" : "Standard"}
                      </span>
                    </Td>
                    <Td align="right">{g.count}</Td>
                    <Td align="right">{inr(g.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totalRevenue)} showChevron={false} />
              <MobileRecordRow label="Count" value={totalCount} />
            </MobileRecordCard>
            {customGarRev.map((g) => (
              <MobileRecordCard key={g.label}>
                <MobileRecordHeader title={g.label} value={inr(g.revenue)} showChevron={false} />
                <MobileRecordRow
                  label="Type"
                  value={
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        g.isCustom ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {g.isCustom ? "Custom" : "Standard"}
                    </span>
                  }
                />
                <MobileRecordRow label="Count" value={g.count} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
