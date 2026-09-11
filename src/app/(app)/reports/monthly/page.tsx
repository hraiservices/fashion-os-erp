"use client";

import { useMemo } from "react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getMonthly } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** The month buckets shown are always the trailing 6 months (see getMonthly) — the date range
 *  narrows which orders count toward each bucket, not the window of months shown. */
export default function MonthlyPnlPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const monthly = useMemo(() => getMonthly(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  const totals = monthly.reduce((acc, m) => ({ count: acc.count + m.count, billed: acc.billed + m.billed, collected: acc.collected + m.collected, pending: acc.pending + m.pending }), { count: 0, billed: 0, collected: 0, pending: 0 });

  return (
    <ReportShell
      title="Stitching Monthly P&L"
      description="Stitching orders only — billed vs collected over the last 6 months. For both revenue streams combined, see Combined P&L."
      actions={
        <ReportActionsMenu
          rows={monthly.map((m) => ({ Month: m.label, Orders: m.count, Billed: m.billed, Collected: m.collected, Pending: m.pending }))}
          filename="stitching-monthly-pl"
          title="Stitching Monthly P&L"
          summaryLines={[`Total billed: ${inr(totals.billed)}`, `Total collected: ${inr(totals.collected)}`]}
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

      <ReportCard className="p-4">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                formatter={(v) => inr(Number(v))}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="billed" name="Billed" stroke="var(--color-primary)" strokeWidth={2} fill="var(--color-primary)" fillOpacity={0.12} />
              <Area type="monotone" dataKey="collected" name="Collected" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <MobileRecordList>
        <MobileRecordCard className="bg-muted/40">
          <MobileRecordHeader title="Total" value={inr(totals.billed)} showChevron={false} />
          <MobileRecordRow label="Orders" value={totals.count} />
          <MobileRecordRow label="Collected" value={inr(totals.collected)} valueClassName="text-emerald-600 dark:text-emerald-400" />
          <MobileRecordRow label="Pending" value={inr(totals.pending)} />
        </MobileRecordCard>
        {monthly.map((m) => (
          <MobileRecordCard key={m.month}>
            <MobileRecordHeader title={m.label} value={inr(m.billed)} showChevron={false} />
            <MobileRecordRow label="Orders" value={m.count} />
            <MobileRecordRow label="Collected" value={inr(m.collected)} valueClassName="text-emerald-600 dark:text-emerald-400" />
            <MobileRecordRow label="Pending" value={m.pending > 0 ? <BalanceDue amount={m.pending} /> : "—"} />
          </MobileRecordCard>
        ))}
      </MobileRecordList>
      <div className="hidden sm:block">
      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th>Month</Th>
            <Th align="right">Orders</Th>
            <Th align="right">Billed</Th>
            <Th align="right">Collected</Th>
            <Th align="right">Pending</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <ReportTotalsRow>
            <Td>Total</Td>
            <Td align="right">{totals.count}</Td>
            <Td align="right">{inr(totals.billed)}</Td>
            <Td align="right">{inr(totals.collected)}</Td>
            <Td align="right">{inr(totals.pending)}</Td>
          </ReportTotalsRow>
          {monthly.map((m) => (
            <tr key={m.month} className="hover:bg-muted/30">
              <Td className="font-medium">{m.label}</Td>
              <Td align="right">{m.count}</Td>
              <Td align="right">{inr(m.billed)}</Td>
              <Td align="right" className="text-emerald-600 dark:text-emerald-400">
                {inr(m.collected)}
              </Td>
              <Td align="right">{m.pending > 0 ? <BalanceDue amount={m.pending} /> : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
      </div>
    </ReportShell>
  );
}
