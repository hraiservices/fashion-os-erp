"use client";

import type { ResponseReportRow } from "@/lib/targets-types";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

const COLUMNS: ReportColumn<ResponseReportRow>[] = [
  { label: "Owner", cell: (r) => r.name, exportValue: (r) => r.name },
  { label: "Usual reply time", align: "right", cell: (r) => r.medianText, exportValue: (r) => r.medianText },
  { label: "Slowest", align: "right", cell: (r) => r.slowestText, exportValue: (r) => r.slowestText },
  { label: "Replied", align: "right", cell: (r) => r.replied, exportValue: (r) => r.replied },
  { label: "Never replied", align: "right", cell: (r) => r.noReply, exportValue: (r) => r.noReply },
];

/** How quickly each person answers a new enquiry, and what answering quickly is worth. */
export default function LeadResponsePage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("response", targetsRange(dr.range));
  const speed = q.data?.speed ?? [];

  return (
    <TargetsReportView
      title="Lead Response Time"
      description="For enquiries that arrived in the period: how long each one waited before someone called, messaged or noted anything on it. The clock stops at the first reply."
      filename="lead-response"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      above={
        speed.length > 0 ? (
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Does answering quickly win more?</h2>
            <p className="text-xs text-muted-foreground">Only decided leads (won or lost) can show a win rate, so a band with few leads means little.</p>
            <ul className="space-y-1.5">
              {speed.map((s) => (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate sm:w-40">{s.label}</span>
                  <span className="h-2.5 min-w-1 rounded-full bg-emerald-500" style={{ width: `${Math.max(2, s.winRatePct)}%` }} aria-hidden />
                  <span className="shrink-0 font-semibold tabular-nums">{s.winRatePct}%</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.won}/{s.leads} won
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
      rows={q.data?.rows ?? []}
      columns={COLUMNS}
      rowKey={(r) => r.employeeId || "none"}
      emptyTitle="No enquiries in this period"
    />
  );
}
