"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getDepositCompliance } from "@/lib/analytics";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StageBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** Open orders with no deposit, or a deposit under 20% of the total — a common source of
 *  no-shows and lost revenue. Threshold is fixed for v1, not yet a Settings-configurable
 *  value (see src/lib/analytics.ts getDepositCompliance). The date range filters which orders
 *  (by inDate) feed this snapshot, not an "as of" date on the compliance state itself. */
export default function DepositCompliancePage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const depositCompliance = useMemo(() => getDepositCompliance(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalAmount = depositCompliance.reduce((s, o) => s + o.total, 0);
  const totalAdvance = depositCompliance.reduce((s, o) => s + o.advance, 0);

  return (
    <ReportShell
      title="Deposit Compliance"
      description={`${depositCompliance.length} open order(s) with little or no deposit collected`}
      actions={
        <ReportActionsMenu
          rows={depositCompliance.map((o) => ({
            Order: o.id,
            Customer: o.name,
            Stage: o.status,
            Total: o.total,
            Advance: o.advance,
            "Deposit %": o.total ? `${Math.round((o.advance / o.total) * 100)}%` : "0%",
          }))}
          filename="deposit-compliance"
          title="Deposit Compliance"
          summaryLines={[`Orders flagged: ${depositCompliance.length}`, `Total value: ${inr(totalAmount)}`]}
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

      {depositCompliance.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="All clear" description="Every open order has at least a 20% deposit." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Stage</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Advance</Th>
                  <Th align="right">Deposit %</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={3}>Total</Td>
                  <Td align="right">{inr(totalAmount)}</Td>
                  <Td align="right">{inr(totalAdvance)}</Td>
                  <Td align="right">{totalAmount ? `${Math.round((totalAdvance / totalAmount) * 100)}%` : "0%"}</Td>
                </ReportTotalsRow>
                {depositCompliance.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <Td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                        {o.id}
                      </Link>
                      <p className="text-xs text-muted-foreground">{fmtDate(o.inDate)}</p>
                    </Td>
                    <Td>
                      <p className="truncate">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.mobile}</p>
                    </Td>
                    <Td>
                      <StageBadge stage={o.status} size="sm" />
                    </Td>
                    <Td align="right">{inr(o.total)}</Td>
                    <Td align="right">{inr(o.advance)}</Td>
                    <Td align="right" className={o.advance === 0 ? "font-medium text-destructive" : undefined}>
                      {o.total ? Math.round((o.advance / o.total) * 100) : 0}%
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totalAmount)} showChevron={false} />
              <MobileRecordRow label="Advance" value={inr(totalAdvance)} />
              <MobileRecordRow label="Deposit %" value={totalAmount ? `${Math.round((totalAdvance / totalAmount) * 100)}%` : "0%"} />
            </MobileRecordCard>
            {depositCompliance.map((o) => (
              <MobileRecordCard key={o.id} href={`/orders/${o.id}`}>
                <MobileRecordHeader title={o.name} subtitle={o.mobile} value={inr(o.total)} />
                <MobileRecordRow label="Order" value={o.id} />
                <MobileRecordRow label="Date" value={fmtDate(o.inDate)} />
                <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
                <MobileRecordRow label="Advance" value={inr(o.advance)} />
                <MobileRecordRow
                  label="Deposit %"
                  value={`${o.total ? Math.round((o.advance / o.total) * 100) : 0}%`}
                  valueClassName={o.advance === 0 ? "font-medium text-destructive" : undefined}
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
