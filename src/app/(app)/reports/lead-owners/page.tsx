"use client";

import { formatWinRate, type OwnerRow } from "@/lib/targets";
import { inr } from "@/lib/format";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { InsightsCard } from "@/components/targets/today-ai";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

type Row = OwnerRow & { name: string };

const pct = formatWinRate; // the server sends a whole percent already

const COLUMNS: ReportColumn<Row>[] = [
  { label: "Owner", cell: (r) => r.name, exportValue: (r) => r.name },
  { label: "Won value", align: "right", cell: (r) => inr(r.wonValue), exportValue: (r) => r.wonValue },
  { label: "Win rate", align: "right", cell: (r) => pct(r.winRate), exportValue: (r) => pct(r.winRate) },
  { label: "Leads", align: "right", cell: (r) => r.total, exportValue: (r) => r.total },
  { label: "Won", align: "right", cell: (r) => r.won, exportValue: (r) => r.won },
  { label: "Lost", align: "right", cell: (r) => r.lost, exportValue: (r) => r.lost },
  { label: "Still open", align: "right", cell: (r) => r.open, exportValue: (r) => r.open },
  { label: "Avg days to win", align: "right", cell: (r) => (r.avgDaysToWin == null ? "–" : Math.round(r.avgDaysToWin)), exportValue: (r) => (r.avgDaysToWin == null ? "" : Math.round(r.avgDaysToWin)) },
];

export default function LeadOwnersPage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("owners", targetsRange(dr.range));
  const rows = q.data?.rows ?? [];
  return (
    <TargetsReportView
      title="Lead Conversion by Owner"
      description="For leads added in the period: how many each person was given, how many they won, how fast, and for how much. Win rate counts only leads that are decided."
      filename="lead-owners"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      above={<InsightsCard range={dr.range.from && dr.range.to ? { from: dr.range.from, to: dr.range.to } : undefined} />}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.ownerId || "none"}
      summaryLines={q.data ? [`Leads: ${q.data.totalLeads}`, `Overall win rate: ${pct(q.data.winRate)}`] : []}
      emptyTitle="No leads in this period"
    />
  );
}
