"use client";

import type { TasksReport } from "@/lib/targets-types";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

type Row = TasksReport["rows"][number];

const COLUMNS: ReportColumn<Row>[] = [
  { label: "Person", cell: (r) => r.name, exportValue: (r) => r.name },
  { label: "Overdue", align: "right", cell: (r) => r.overdue, exportValue: (r) => r.overdue },
  { label: "Open", align: "right", cell: (r) => r.open, exportValue: (r) => r.open },
  { label: "Due today", align: "right", cell: (r) => r.dueToday, exportValue: (r) => r.dueToday },
  { label: "Finished in period", align: "right", cell: (r) => r.doneInRange, exportValue: (r) => r.doneInRange },
  { label: "Longest overdue (days)", align: "right", cell: (r) => r.oldestOverdueDays ?? "–", exportValue: (r) => r.oldestOverdueDays ?? "" },
];

export default function TasksFollowupsPage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("tasks", targetsRange(dr.range));
  const rows = q.data?.rows ?? [];
  const buckets = q.data?.ageBuckets ?? [];
  return (
    <TargetsReportView
      title="Tasks & Follow-ups"
      description="Open, overdue and finished tasks for each person. Follow-ups are tasks linked to a lead."
      filename="tasks-followups"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r, i) => r.assigneeId ?? `none-${i}`}
      summaryLines={[`Open: ${rows.reduce((s, r) => s + r.open, 0)}`, `Overdue: ${rows.reduce((s, r) => s + r.overdue, 0)}`]}
      emptyTitle="No tasks yet"
      above={
        buckets.some((b) => b.count > 0) && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {buckets.map((b) => (
              <div key={b.label} className="rounded-xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">{b.label}</p>
                <p className="text-lg font-semibold">{b.count}</p>
              </div>
            ))}
          </div>
        )
      }
    />
  );
}
