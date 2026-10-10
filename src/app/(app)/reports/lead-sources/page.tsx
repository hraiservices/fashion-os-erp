"use client";

import type { SourceRow } from "@/lib/targets";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);

const COLUMNS: ReportColumn<SourceRow>[] = [
  { label: "Source", cell: (r) => r.source || "Not noted", exportValue: (r) => r.source || "Not noted" },
  { label: "Win rate", align: "right", cell: (r) => pct(r.winRate), exportValue: (r) => pct(r.winRate) },
  { label: "Leads", align: "right", cell: (r) => r.total, exportValue: (r) => r.total },
  { label: "Won", align: "right", cell: (r) => r.won, exportValue: (r) => r.won },
  { label: "Lost", align: "right", cell: (r) => r.lost, exportValue: (r) => r.lost },
  { label: "Still open", align: "right", cell: (r) => r.open, exportValue: (r) => r.open },
  { label: "Avg days to win", align: "right", cell: (r) => (r.avgDaysToWin == null ? "–" : Math.round(r.avgDaysToWin)), exportValue: (r) => (r.avgDaysToWin == null ? "" : Math.round(r.avgDaysToWin)) },
];

export default function LeadSourcesPage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("sources", targetsRange(dr.range));
  const rows = q.data?.rows ?? [];
  return (
    <TargetsReportView
      title="Lead Sources & Win Rate"
      description="Where your leads come from and how many of them you win. Win rate counts only leads that are decided."
      filename="lead-sources"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.source || "none"}
      summaryLines={q.data ? [`Leads: ${q.data.totalLeads}`, `Overall win rate: ${pct(q.data.winRate)}`] : []}
      emptyTitle="No leads in this period"
    />
  );
}
