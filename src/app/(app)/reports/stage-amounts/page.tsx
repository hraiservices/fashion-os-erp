"use client";

import { useMemo } from "react";
import { Inbox, Scissors, Shirt, Sparkles, PackageCheck, Truck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getStageAmounts, type StageAmountRow } from "@/lib/analytics";
import { STAGE_META, type Stage } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

const STAGE_ICONS: Record<Stage, LucideIcon> = {
  received: Inbox,
  cutting: Scissors,
  stitching: Shirt,
  finishing: Sparkles,
  ready: PackageCheck,
  delivered: Truck,
  payment: Wallet,
};

const STAGE_COLORS: Record<Stage, string> = {
  received: "#71717A",
  cutting: "#D97706",
  stitching: "#374151",
  finishing: "#7C3AED",
  ready: "#059669",
  delivered: "#0891B2",
  payment: "#065F46",
};

/** Stages Wise Amount — a LIVE snapshot: every order's CURRENT stage right now, summed by
 *  billed total. The date range only narrows which orders count (by when they were placed,
 *  same isWithinDateRange(o.inDate, range) convention every other report uses) — it never asks
 *  "what stage was this order in as of that date," which would need the order's full
 *  stage-history replayed and isn't something this report (or any other in the app) does. */
export default function StageAmountsPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows: StageAmountRow[] = useMemo(
    () => getStageAmounts(orders.filter((o) => isWithinDateRange(o.inDate, range))),
    [orders, range]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  const totalOrders = rows.reduce((s, r) => s + r.count, 0);
  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const chartData = rows.map((r) => ({ stage: STAGE_META[r.stage].label, total: r.total, fill: STAGE_COLORS[r.stage] }));

  return (
    <ReportShell
      title="Stages Wise Amount"
      description="Live snapshot — every order's current stage right now, totaled by billed value. The date range narrows which orders count (by order date), not what stage they were in historically."
      actions={
        <ReportActionsMenu
          rows={rows.map((r) => ({ Stage: STAGE_META[r.stage].label, Orders: r.count, "Total Amount": r.total }))}
          filename="stages-wise-amount"
          title="Stages Wise Amount"
          summaryLines={[`Orders: ${totalOrders}`, `Total amount: ${inr(totalAmount)}`, ...rows.map((r) => `${STAGE_META[r.stage].label}: ${r.count} (${inr(r.total)})`)]}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {rows.map((r) => (
          <StatCard
            key={r.stage}
            label={STAGE_META[r.stage].label}
            value={inr(r.total)}
            hint={`${r.count} order${r.count === 1 ? "" : "s"}`}
            icon={STAGE_ICONS[r.stage]}
            href={`/orders?stage=${r.stage}`}
          />
        ))}
      </div>

      <ReportCard className="p-4">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
              <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                formatter={(v) => inr(Number(v))}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.stage} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <MobileRecordList>
        <MobileRecordCard className="bg-muted/40">
          <MobileRecordHeader title="Total" value={inr(totalAmount)} showChevron={false} />
          <MobileRecordRow label="Orders" value={totalOrders} />
        </MobileRecordCard>
        {rows.map((r) => (
          <MobileRecordCard key={r.stage}>
            <MobileRecordHeader title={STAGE_META[r.stage].label} value={inr(r.total)} showChevron={false} />
            <MobileRecordRow label="Orders" value={r.count} />
          </MobileRecordCard>
        ))}
      </MobileRecordList>
      <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Stage</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Total Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{totalOrders}</Td>
              <Td align="right">{inr(totalAmount)}</Td>
            </ReportTotalsRow>
            {rows.map((r) => (
              <tr key={r.stage} className="hover:bg-muted/30">
                <Td className="font-medium">{STAGE_META[r.stage].label}</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right">{inr(r.total)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </div>
    </ReportShell>
  );
}
