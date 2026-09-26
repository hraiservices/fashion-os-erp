"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getTodayDeliverables } from "@/lib/analytics";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StageBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import type { Order } from "@/lib/types";
import { useTableSort } from "@/hooks/use-table-sort";

const DELIVERABLES_SORT_COMPARATORS: Record<string, (a: Order, b: Order) => number> = {
  order: (a, b) => a.id.localeCompare(b.id),
  customer: (a, b) => a.name.localeCompare(b.name),
  delivery: (a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""),
  balance: (a, b) => a.balance - b.balance,
};
const DELIVERABLES_SORT_DESC_KEYS = new Set(["balance"]);

/** What's actually promised for today (or whichever range is selected) — the flip side of
 *  Pending Orders, which is "everything still in progress" regardless of delivery date. The
 *  overdue backlog is shown as its own section, always relative to the real calendar today
 *  (see getTodayDeliverables), independent of the range picker above it. */
export default function TodayDeliverablesPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange("today");
  const [status, setStatus] = useState("all");

  const { due: allDue, overdue: allOverdue } = useMemo(() => getTodayDeliverables(orders, range), [orders, range]);

  const statuses = useMemo(() => {
    const set = new Set([...allDue, ...allOverdue].map((o) => o.status).filter(Boolean));
    return Array.from(set).sort();
  }, [allDue, allOverdue]);

  const due = useMemo(() => (status === "all" ? allDue : allDue.filter((o) => o.status === status)), [allDue, status]);
  const overdue = useMemo(() => (status === "all" ? allOverdue : allOverdue.filter((o) => o.status === status)), [allOverdue, status]);

  const dueSort = useTableSort<Order>("today-deliverables-due", DELIVERABLES_SORT_COMPARATORS, DELIVERABLES_SORT_DESC_KEYS);
  const overdueSort = useTableSort<Order>("today-deliverables-overdue", DELIVERABLES_SORT_COMPARATORS, DELIVERABLES_SORT_DESC_KEYS);
  const sortedDue = dueSort.applySort(due);
  const sortedOverdue = overdueSort.applySort(overdue);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const dueBalance = due.reduce((s, o) => s + o.balance, 0);
  const overdueBalance = overdue.reduce((s, o) => s + o.balance, 0);

  function renderRow(o: Order) {
    return (
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
        <Td className="whitespace-nowrap">{fmtDate(o.deliveryDate)}</Td>
        <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
        <Td align="right">
          {o.balance > 0 && <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop)} label={`Payment reminder to ${o.name}`} tone="reminder" />}
        </Td>
      </tr>
    );
  }

  function renderMobileCard(o: Order) {
    return (
      <MobileRecordCard key={o.id} href={`/orders/${o.id}`}>
        <MobileRecordHeader
          title={o.name}
          subtitle={o.mobile}
          value={o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}
        />
        <MobileRecordRow label="Order" value={o.id} />
        <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
        <MobileRecordRow label="Delivery" value={fmtDate(o.deliveryDate)} />
        {o.balance > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Actions</span>
            <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop)} label={`Payment reminder to ${o.name}`} tone="reminder" />
          </div>
        )}
      </MobileRecordCard>
    );
  }

  return (
    <ReportShell
      title="Today Deliverables"
      description={`${due.length} order(s) due in the selected range, plus ${overdue.length} overdue`}
      actions={
        <ReportActionsMenu
          rows={[...sortedOverdue, ...sortedDue].map((o) => ({ Order: o.id, Customer: o.name, Stage: o.status, Delivery: fmtDate(o.deliveryDate), Balance: o.balance }))}
          filename="today-deliverables"
          title="Today Deliverables"
          summaryLines={[`Due: ${due.length}`, `Overdue: ${overdue.length}`, `Total balance due: ${inr(dueBalance + overdueBalance)}`]}
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
          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{status === "all" ? "All Statuses" : status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {overdue.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-destructive">Overdue ({overdue.length})</h2>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="order" currentSort={{ key: overdueSort.sortKey, asc: overdueSort.sortAsc }} onSort={overdueSort.toggleSort}>Order</Th>
                  <Th sortKey="customer" currentSort={{ key: overdueSort.sortKey, asc: overdueSort.sortAsc }} onSort={overdueSort.toggleSort}>Customer</Th>
                  <Th>Stage</Th>
                  <Th sortKey="delivery" currentSort={{ key: overdueSort.sortKey, asc: overdueSort.sortAsc }} onSort={overdueSort.toggleSort}>Delivery</Th>
                  <Th align="right" sortKey="balance" currentSort={{ key: overdueSort.sortKey, asc: overdueSort.sortAsc }} onSort={overdueSort.toggleSort}>Balance</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={4}>Total</Td>
                  <Td align="right">{inr(overdueBalance)}</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {sortedOverdue.map(renderRow)}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(overdueBalance)} showChevron={false} />
            </MobileRecordCard>
            {sortedOverdue.map(renderMobileCard)}
          </MobileRecordList>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Due{preset === "today" ? " today" : ""} ({due.length})</h2>
        {due.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title="Nothing due" description="No pending orders are due in this range." />
        ) : (
          <>
            <div className="hidden sm:block">
              <ReportTable>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <Th sortKey="order" currentSort={{ key: dueSort.sortKey, asc: dueSort.sortAsc }} onSort={dueSort.toggleSort}>Order</Th>
                    <Th sortKey="customer" currentSort={{ key: dueSort.sortKey, asc: dueSort.sortAsc }} onSort={dueSort.toggleSort}>Customer</Th>
                    <Th>Stage</Th>
                    <Th sortKey="delivery" currentSort={{ key: dueSort.sortKey, asc: dueSort.sortAsc }} onSort={dueSort.toggleSort}>Delivery</Th>
                    <Th align="right" sortKey="balance" currentSort={{ key: dueSort.sortKey, asc: dueSort.sortAsc }} onSort={dueSort.toggleSort}>Balance</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <ReportTotalsRow>
                    <Td colSpan={4}>Total</Td>
                    <Td align="right">{inr(dueBalance)}</Td>
                    <Td align="right">—</Td>
                  </ReportTotalsRow>
                  {sortedDue.map(renderRow)}
                </tbody>
              </ReportTable>
            </div>
            <MobileRecordList>
              <MobileRecordCard className="bg-muted/40">
                <MobileRecordHeader title="Total" value={inr(dueBalance)} showChevron={false} />
              </MobileRecordCard>
              {sortedDue.map(renderMobileCard)}
            </MobileRecordList>
          </>
        )}
      </div>
    </ReportShell>
  );
}
