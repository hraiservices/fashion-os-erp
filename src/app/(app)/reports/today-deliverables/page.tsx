"use client";

import { useMemo } from "react";
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
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange } from "@/lib/report-date-range";
import type { Order } from "@/lib/types";

/** What's actually promised for today (or whichever range is selected) — the flip side of
 *  Pending Orders, which is "everything still in progress" regardless of delivery date. The
 *  overdue backlog is shown as its own section, always relative to the real calendar today
 *  (see getTodayDeliverables), independent of the range picker above it. */
export default function TodayDeliverablesPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange("today");

  const { due, overdue } = useMemo(() => getTodayDeliverables(orders, range), [orders, range]);

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
          {o.balance > 0 && <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop)} label={`Payment reminder to ${o.name}`} />}
        </Td>
      </tr>
    );
  }

  return (
    <ReportShell
      title="Today Deliverables"
      description={`${due.length} order(s) due in the selected range, plus ${overdue.length} overdue`}
      actions={
        <ReportActionsMenu
          rows={[...overdue, ...due].map((o) => ({ Order: o.id, Customer: o.name, Stage: o.status, Delivery: fmtDate(o.deliveryDate), Balance: o.balance }))}
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
      />

      {overdue.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-destructive">Overdue ({overdue.length})</h2>
          <ReportTable>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Stage</Th>
                <Th>Delivery</Th>
                <Th align="right">Balance</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <ReportTotalsRow>
                <Td colSpan={4}>Total</Td>
                <Td align="right">{inr(overdueBalance)}</Td>
                <Td align="right">—</Td>
              </ReportTotalsRow>
              {overdue.map(renderRow)}
            </tbody>
          </ReportTable>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Due{preset === "today" ? " today" : ""} ({due.length})</h2>
        {due.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title="Nothing due" description="No pending orders are due in this range." />
        ) : (
          <ReportTable>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Stage</Th>
                <Th>Delivery</Th>
                <Th align="right">Balance</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <ReportTotalsRow>
                <Td colSpan={4}>Total</Td>
                <Td align="right">{inr(dueBalance)}</Td>
                <Td align="right">—</Td>
              </ReportTotalsRow>
              {due.map(renderRow)}
            </tbody>
          </ReportTable>
        )}
      </div>
    </ReportShell>
  );
}
