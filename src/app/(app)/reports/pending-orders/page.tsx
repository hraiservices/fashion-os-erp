"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getPendingOrders } from "@/lib/analytics";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StageBadge, DueBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_META } from "@/lib/business-rules";
import { useTableSort } from "@/hooks/use-table-sort";

type PendingOrderRow = ReturnType<typeof getPendingOrders>[number];

export default function PendingOrdersPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [stage, setStage] = useState("all");

  const allPending = useMemo(() => getPendingOrders(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);
  const stages = useMemo(() => {
    const set = new Set(allPending.map((o) => o.status).filter(Boolean));
    return Array.from(set).sort();
  }, [allPending]);
  const pending = useMemo(() => allPending.filter((o) => stage === "all" || o.status === stage), [allPending, stage]);

  const sortComparators: Record<string, (a: PendingOrderRow, b: PendingOrderRow) => number> = {
    order: (a, b) => a.id.localeCompare(b.id),
    customer: (a, b) => a.name.localeCompare(b.name),
    stage: (a, b) => a.status.localeCompare(b.status),
    delivery: (a, b) => a.deliveryDate.localeCompare(b.deliveryDate),
    balance: (a, b) => a.balance - b.balance,
  };
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<PendingOrderRow>("pending-orders", sortComparators, new Set(["balance"]));
  const sortedPending = applySort(pending);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalBalance = pending.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="Pending Orders"
      description={`${pending.length} orders still in progress, soonest delivery first`}
      actions={
        <ReportActionsMenu
          rows={sortedPending.map((o) => ({ Order: o.id, Customer: o.name, Stage: o.status, Delivery: fmtDate(o.deliveryDate), Balance: o.balance }))}
          filename="pending-orders"
          title="Pending Orders"
          summaryLines={[`Orders: ${pending.length}`, `Total balance due: ${inr(totalBalance)}`]}
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
          <Select value={stage} onValueChange={(v) => v && setStage(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{stage === "all" ? "All Stages" : STAGE_META[stage as keyof typeof STAGE_META]?.label || stage}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_META[s as keyof typeof STAGE_META]?.label || s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {pending.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing pending" description="Every order has been delivered and paid." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totalBalance)} showChevron={false} />
            </MobileRecordCard>
            {sortedPending.map((o) => (
              <MobileRecordCard key={o.id}>
                <MobileRecordHeader
                  title={
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.id}
                    </Link>
                  }
                  subtitle={`${o.name} · ${o.mobile}`}
                  value={o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}
                  showChevron={false}
                />
                <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
                <MobileRecordRow
                  label="Delivery"
                  value={
                    <span className="flex items-center gap-1.5">
                      {fmtDate(o.deliveryDate)} <DueBadge order={o} />
                    </span>
                  }
                />
                {o.balance > 0 && (
                  <div className="flex justify-end border-t pt-1.5">
                    <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop)} label={`Payment reminder to ${o.name}`} tone="reminder" />
                  </div>
                )}
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="order" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Order</Th>
              <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
              <Th sortKey="stage" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Stage</Th>
              <Th sortKey="delivery" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Delivery</Th>
              <Th align="right" sortKey="balance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td colSpan={4}>Total</Td>
              <Td align="right">{inr(totalBalance)}</Td>
              <Td align="right">—</Td>
            </ReportTotalsRow>
            {sortedPending.map((o) => (
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
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="whitespace-nowrap">{fmtDate(o.deliveryDate)}</span>
                    <DueBadge order={o} />
                  </div>
                </Td>
                <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                <Td align="right">
                  {o.balance > 0 && <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop)} label={`Payment reminder to ${o.name}`} tone="reminder" />}
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
