"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getOverdueInProduction } from "@/lib/analytics";
import { STAGE_META, type Stage } from "@/lib/business-rules";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StageBadge } from "@/components/orders/stage-badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const PRE_READY_STAGES: Stage[] = ["received", "cutting", "stitching", "finishing"];

/** "Overdue" here means the order itself is running late — still in production past its
 *  promised delivery date — not a payment problem (see getOverdueInProduction's own comment for
 *  why Ready/Delivered/Payment orders are excluded; those are the LIVE Report's job). Always a
 *  live snapshot of right now, same as the LIVE Report and Tailor Payables, since "is this order
 *  late today" isn't a question a date-range filter makes sense for. */
export default function OverdueOrdersPage() {
  const { orders, isLoading } = useReportsData();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const overdue = getOverdueInProduction(orders);
  const byStage = PRE_READY_STAGES.map((stage) => ({
    stage,
    label: STAGE_META[stage].label,
    count: overdue.filter((o) => o.status === stage).length,
  })).filter((s) => s.count > 0);
  const worstDaysLate = overdue[0]?.daysLate ?? 0;
  const totalBalance = overdue.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="Overdue Orders"
      description="Still in production past the promised delivery date — worst delays first"
      actions={
        <ReportActionsMenu
          rows={overdue.map((o) => ({
            Order: o.id,
            Customer: o.name,
            Stage: STAGE_META[o.status].label,
            "Delivery date": fmtDate(o.deliveryDate),
            "Days late": o.daysLate,
            Balance: o.balance,
          }))}
          filename="overdue-orders"
          title="Overdue Orders"
          summaryLines={[`Overdue orders: ${overdue.length}`, `Worst delay: ${worstDaysLate} day${worstDaysLate === 1 ? "" : "s"}`]}
        />
      }
    >
      {overdue.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nothing overdue" description="Every in-production order is still within its delivery date." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Overdue orders" value={overdue.length} icon={AlertTriangle} tone="danger" />
            <StatCard label="Worst delay" value={`${worstDaysLate} day${worstDaysLate === 1 ? "" : "s"}`} icon={AlertTriangle} tone="danger" />
            {byStage.map((s) => (
              <StatCard key={s.stage} label={`Stuck in ${s.label}`} value={s.count} icon={AlertTriangle} />
            ))}
          </div>

          <MobileRecordList>
            {overdue.map((o) => (
              <MobileRecordCard key={o.id}>
                <MobileRecordHeader
                  title={
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.id}
                    </Link>
                  }
                  subtitle={`${o.name} · ${o.mobile}`}
                  value={<span className="font-semibold text-destructive">{o.daysLate}d late</span>}
                  showChevron={false}
                />
                <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
                <MobileRecordRow label="Delivery date" value={fmtDate(o.deliveryDate)} />
                <MobileRecordRow label="Balance" value={o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Stage</Th>
                  <Th>Delivery date</Th>
                  <Th align="right">Days late</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overdue.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <Td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                        {o.id}
                      </Link>
                    </Td>
                    <Td>
                      <p className="truncate">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.mobile}</p>
                    </Td>
                    <Td>
                      <StageBadge stage={o.status} size="sm" />
                    </Td>
                    <Td>{fmtDate(o.deliveryDate)}</Td>
                    <Td align="right" className="font-semibold text-destructive">
                      {o.daysLate}d
                    </Td>
                    <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          {totalBalance > 0 && (
            <p className="text-xs text-muted-foreground">{inr(totalBalance)} in combined balance also outstanding on these orders.</p>
          )}
        </>
      )}
    </ReportShell>
  );
}
