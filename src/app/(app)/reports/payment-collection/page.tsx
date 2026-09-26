"use client";

import { useMemo, useState } from "react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getPaymentStats } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";
import { useTableSort } from "@/hooks/use-table-sort";

type MonthStatRow = ReturnType<typeof getPaymentStats>[number];

type PaymentStatus = "all" | "paid" | "partial" | "unpaid";
const STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Fully Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
];

export default function PaymentCollectionPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [status, setStatus] = useState<PaymentStatus>("all");

  const paymentStats = useMemo(() => {
    const inRange = orders.filter((o) => isWithinDateRange(o.inDate, range));
    const filtered =
      status === "all"
        ? inRange
        : inRange.filter((o) => {
            if (status === "paid") return (o.balance || 0) <= 0;
            if (status === "partial") return (o.advance || 0) > 0 && (o.balance || 0) > 0;
            return !(o.advance || 0);
          });
    return getPaymentStats(filtered);
  }, [orders, range, status]);

  const sortComparators: Record<string, (a: MonthStatRow, b: MonthStatRow) => number> = {
    month: (a, b) => a.month.localeCompare(b.month),
    count: (a, b) => a.count - b.count,
    billed: (a, b) => a.billed - b.billed,
    collected: (a, b) => a.collected - b.collected,
    collectionPct: (a, b) => a.collectionPct - b.collectionPct,
    fullyPaid: (a, b) => a.fullyPaid - b.fullyPaid,
    partPaid: (a, b) => a.partPaid - b.partPaid,
    unpaid: (a, b) => a.unpaid - b.unpaid,
  };
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<MonthStatRow>(
    "payment-collection",
    sortComparators,
    new Set(["count", "billed", "collected", "collectionPct", "fullyPaid", "partPaid", "unpaid"])
  );
  const sortedStats = applySort(paymentStats);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totals = paymentStats.reduce(
    (acc, m) => ({
      count: acc.count + m.count,
      billed: acc.billed + m.billed,
      collected: acc.collected + m.collected,
      fullyPaid: acc.fullyPaid + m.fullyPaid,
      partPaid: acc.partPaid + m.partPaid,
      unpaid: acc.unpaid + m.unpaid,
    }),
    { count: 0, billed: 0, collected: 0, fullyPaid: 0, partPaid: 0, unpaid: 0 }
  );
  const collectionPct = totals.billed > 0 ? Math.round((totals.collected / totals.billed) * 100) : 0;

  return (
    <ReportShell
      title="Stitching Payment Collection"
      description="Stitching orders only — how much of what you billed actually came in, month by month. For both revenue streams combined, see Combined P&L."
      actions={
        <ReportActionsMenu
          rows={sortedStats.map((m) => ({ Month: m.label, Orders: m.count, Billed: m.billed, Collected: m.collected, "Collection %": `${m.collectionPct}%`, Paid: m.fullyPaid, Partial: m.partPaid, Unpaid: m.unpaid }))}
          filename="payment-collection"
          title="Stitching Payment Collection"
          summaryLines={[`Total billed: ${inr(totals.billed)}`, `Total collected: ${inr(totals.collected)} (${collectionPct}%)`]}
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
          <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by payment status">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setStatus(o.value)}
                aria-pressed={status === o.value}
                className={cn(
                  "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                  status === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        }
      />

      <MobileRecordList>
        <MobileRecordCard className="bg-muted/40">
          <MobileRecordHeader title="Total" value={inr(totals.billed)} showChevron={false} />
          <MobileRecordGrid
            items={[
              { label: "Orders", value: totals.count },
              { label: "Collected", value: inr(totals.collected) },
              { label: "Collection", value: `${collectionPct}%` },
              { label: "Paid", value: totals.fullyPaid, valueClassName: "text-emerald-600 dark:text-emerald-400" },
              { label: "Partial", value: totals.partPaid, valueClassName: "text-amber-600 dark:text-amber-400" },
              { label: "Unpaid", value: totals.unpaid, valueClassName: "text-red-600 dark:text-red-400" },
            ]}
          />
        </MobileRecordCard>
        {sortedStats.map((m) => (
          <MobileRecordCard key={m.month}>
            <MobileRecordHeader title={m.label} value={inr(m.billed)} showChevron={false} />
            <MobileRecordGrid
              items={[
                { label: "Orders", value: m.count },
                { label: "Collected", value: inr(m.collected) },
                { label: "Collection", value: `${m.collectionPct}%` },
                { label: "Paid", value: m.fullyPaid, valueClassName: "text-emerald-600 dark:text-emerald-400" },
                { label: "Partial", value: m.partPaid, valueClassName: "text-amber-600 dark:text-amber-400" },
                { label: "Unpaid", value: m.unpaid, valueClassName: "text-red-600 dark:text-red-400" },
              ]}
            />
          </MobileRecordCard>
        ))}
      </MobileRecordList>

      <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="month" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Month</Th>
              <Th align="right" sortKey="count" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
              <Th align="right" sortKey="billed" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Billed</Th>
              <Th align="right" sortKey="collected" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Collected</Th>
              <Th sortKey="collectionPct" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Collection</Th>
              <Th align="right" sortKey="fullyPaid" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Paid</Th>
              <Th align="right" sortKey="partPaid" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Partial</Th>
              <Th align="right" sortKey="unpaid" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Unpaid</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{totals.count}</Td>
              <Td align="right">{inr(totals.billed)}</Td>
              <Td align="right">{inr(totals.collected)}</Td>
              <Td>{collectionPct}%</Td>
              <Td align="right">{totals.fullyPaid}</Td>
              <Td align="right">{totals.partPaid}</Td>
              <Td align="right">{totals.unpaid}</Td>
            </ReportTotalsRow>
            {sortedStats.map((m) => (
              <tr key={m.month} className="hover:bg-muted/30">
                <Td className="font-medium">{m.label}</Td>
                <Td align="right">{m.count}</Td>
                <Td align="right">{inr(m.billed)}</Td>
                <Td align="right">{inr(m.collected)}</Td>
                <Td>
                  <div className="flex min-w-24 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${m.collectionPct >= 90 ? "bg-emerald-500" : m.collectionPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${m.collectionPct}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{m.collectionPct}%</span>
                  </div>
                </Td>
                <Td align="right" className="text-emerald-600 dark:text-emerald-400">
                  {m.fullyPaid}
                </Td>
                <Td align="right" className="text-amber-600 dark:text-amber-400">
                  {m.partPaid}
                </Td>
                <Td align="right" className="text-red-600 dark:text-red-400">
                  {m.unpaid}
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </div>
    </ReportShell>
  );
}
