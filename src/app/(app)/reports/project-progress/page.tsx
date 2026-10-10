"use client";

import { fmtDateShort } from "@/lib/format";
import { PROJECT_STATUS_LABELS } from "@/lib/work-tasks";
import type { ProjectsReport } from "@/lib/targets-types";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

type Row = ProjectsReport["projects"][number];

const COLUMNS: ReportColumn<Row>[] = [
  { label: "Project", cell: (r) => r.name, exportValue: (r) => r.name },
  { label: "% done", align: "right", cell: (r) => `${r.progress.pct}%`, exportValue: (r) => r.progress.pct },
  { label: "Tasks done", align: "right", cell: (r) => `${r.progress.done}/${r.progress.total}`, exportValue: (r) => `${r.progress.done}/${r.progress.total}` },
  { label: "Overdue tasks", align: "right", cell: (r) => r.overdueTasks, exportValue: (r) => r.overdueTasks },
  { label: "Status", cell: (r) => PROJECT_STATUS_LABELS[r.status as keyof typeof PROJECT_STATUS_LABELS] ?? r.status, exportValue: (r) => PROJECT_STATUS_LABELS[r.status as keyof typeof PROJECT_STATUS_LABELS] ?? r.status },
  { label: "Owner", cell: (r) => r.ownerName, exportValue: (r) => r.ownerName },
  { label: "Dates", cell: (r) => (r.startDate || r.endDate ? `${r.startDate ? fmtDateShort(r.startDate) : "?"} – ${r.endDate ? fmtDateShort(r.endDate) : "?"}` : "–"), exportValue: (r) => `${r.startDate ?? ""} to ${r.endDate ?? ""}` },
];

export default function ProjectProgressPage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("projects", targetsRange(dr.range));
  const rows = q.data?.projects ?? [];
  return (
    <TargetsReportView
      title="Project Progress"
      description="How far along each project is, based on the tasks finished. Shows projects running in the period."
      filename="project-progress"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.id}
      summaryLines={[`Projects: ${rows.length}`, `Overdue tasks: ${rows.reduce((s, r) => s + r.overdueTasks, 0)}`]}
      emptyTitle="No projects in this period"
    />
  );
}
