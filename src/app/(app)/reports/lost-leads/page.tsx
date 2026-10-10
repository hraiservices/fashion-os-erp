"use client";

import { fmtDateShort, inr } from "@/lib/format";
import type { LostReport } from "@/lib/targets-types";
import { useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";

type Row = LostReport["leads"][number];

const COLUMNS: ReportColumn<Row>[] = [
  { label: "Lead", cell: (r) => r.name, exportValue: (r) => r.name },
  { label: "Expected ₹", align: "right", cell: (r) => inr(r.value), exportValue: (r) => r.value },
  { label: "Why lost", cell: (r) => r.reason || "Not noted", exportValue: (r) => r.reason },
  { label: "Owner", cell: (r) => r.owner, exportValue: (r) => r.owner },
  { label: "Lost on", cell: (r) => (r.lostOn ? fmtDateShort(r.lostOn) : "–"), exportValue: (r) => r.lostOn ?? "" },
];

export default function LostLeadsPage() {
  const dr = useReportDateRange("this-month");
  const q = useTargetsReport("lost", targetsRange(dr.range));
  const rows = q.data?.leads ?? [];
  const reasons = q.data?.reasons ?? [];
  return (
    <TargetsReportView
      title="Lost Leads & Reasons"
      description="Leads you lost in the period and the reasons given, so you can see what to fix."
      filename="lost-leads"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r) => r.id}
      summaryLines={[`Lost leads: ${rows.length}`, `Value lost: ${inr(rows.reduce((s, r) => s + r.value, 0))}`]}
      emptyTitle="No lost leads in this period"
      above={
        reasons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <span key={r.reason} className="rounded-full border bg-card px-3 py-1.5 text-sm">
                {r.reason || "Not noted"} <span className="font-semibold">{r.count}</span>
              </span>
            ))}
          </div>
        )
      }
    />
  );
}
