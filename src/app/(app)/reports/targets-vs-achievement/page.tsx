"use client";

import { fmtDateShort } from "@/lib/format";
import { formatMetricValue, METRIC_LABELS, TARGET_STATUS_LABELS } from "@/lib/targets";
import type { TargetReportRow } from "@/lib/targets-types";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

const who = (r: TargetReportRow) => (r.scope === "shop" ? "Whole shop" : r.assigneeNames.join(", ") || "Nobody");

const COLUMNS: ReportColumn<TargetReportRow>[] = [
  { label: "Target", cell: (r) => r.title, exportValue: (r) => r.title },
  { label: "Achieved", align: "right", cell: (r) => formatMetricValue(r.metric, r.progress.achieved), exportValue: (r) => r.progress.achieved },
  { label: "Goal", align: "right", cell: (r) => formatMetricValue(r.metric, r.progress.target), exportValue: (r) => r.progress.target },
  { label: "% done", align: "right", cell: (r) => `${Math.round(r.progress.pct)}%`, exportValue: (r) => Math.round(r.progress.pct) },
  { label: "Status", cell: (r) => TARGET_STATUS_LABELS[r.progress.status], exportValue: (r) => TARGET_STATUS_LABELS[r.progress.status] },
  { label: "For", cell: who, exportValue: who },
  { label: "What is counted", cell: (r) => METRIC_LABELS[r.metric], exportValue: (r) => METRIC_LABELS[r.metric] },
  { label: "Dates", cell: (r) => `${fmtDateShort(r.startDate)} – ${fmtDateShort(r.endDate)}`, exportValue: (r) => `${r.startDate} to ${r.endDate}` },
  { label: "Days left", align: "right", cell: (r) => r.progress.daysLeft, exportValue: (r) => r.progress.daysLeft },
];

export default function TargetsVsAchievementPage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("target-vs-achievement", targetsRange(dr.range));
  const rows = q.data?.rows ?? [];
  return (
    <TargetsReportView
      title="Target vs Achievement"
      description="Every target running in the period: the goal, what has been achieved, and whether it is on pace."
      filename="target-vs-achievement"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.id}
      summaryLines={[`Targets: ${rows.length}`, `Achieved: ${rows.filter((r) => r.progress.status === "achieved").length}`, `Behind pace: ${rows.filter((r) => r.progress.status === "at_risk").length}`]}
      emptyTitle="No targets in this period"
    />
  );
}
