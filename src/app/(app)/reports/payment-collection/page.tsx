"use client";

import { useMemo } from "react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getPaymentStats } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function PaymentCollectionPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const paymentStats = useMemo(() => getPaymentStats(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Stitching Payment Collection" description="Stitching orders only — how much of what you billed actually came in, month by month. For both revenue streams combined, see Combined P&L.">
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th>Month</Th>
            <Th align="right">Orders</Th>
            <Th align="right">Billed</Th>
            <Th align="right">Collected</Th>
            <Th>Collection</Th>
            <Th align="right">Paid</Th>
            <Th align="right">Partial</Th>
            <Th align="right">Unpaid</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {paymentStats.map((m) => (
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
    </ReportShell>
  );
}
