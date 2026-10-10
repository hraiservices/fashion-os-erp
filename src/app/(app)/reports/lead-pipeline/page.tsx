"use client";

import { inr } from "@/lib/format";
import { stageLabel } from "@/lib/lead-stages";
import { useTargetsReport, useTargetsMeta } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, type ReportColumn } from "@/components/targets/report-page";
import { StatCard } from "@/components/ui/stat-card";
import { ChartBarDuotoneIcon, UsersDuotoneIcon, WalletDuotoneIcon } from "@/components/icons/duotone-icons";

type Row = { stage: string; count: number; value: number; likelyValue: number };

export default function LeadPipelinePage() {
  const dr = useReportDateRange("this-month");
  const meta = useTargetsMeta().data;
  const q = useTargetsReport("pipeline", targetsRange(dr.range));
  const d = q.data;
  const rows: Row[] = d?.rows ?? [];
  const columns: ReportColumn<Row>[] = [
    { label: "Stage", cell: (r) => stageLabel(r.stage, meta?.stageLabels), exportValue: (r) => stageLabel(r.stage, meta?.stageLabels) },
    { label: "Expected ₹", align: "right", cell: (r) => inr(r.value), exportValue: (r) => r.value },
    { label: "Leads", align: "right", cell: (r) => r.count, exportValue: (r) => r.count },
    { label: "Likely to close ₹", align: "right", cell: (r) => inr(r.likelyValue), exportValue: (r) => r.likelyValue },
  ];
  return (
    <TargetsReportView
      title="Lead Pipeline"
      description="How many leads sit in each stage and what they are worth. Shows leads created in the period."
      filename="lead-pipeline"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      rows={rows}
      columns={columns}
      rowKey={(r) => r.stage}
      summaryLines={d ? [`Open leads: ${d.openCount}`, `Open value: ${inr(d.openValue)}`, `Likely to close: ${inr(d.likelyValue)}`] : []}
      emptyTitle="No leads yet"
      above={
        d && (
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={UsersDuotoneIcon} label="Open leads" value={String(d.openCount)} />
            <StatCard icon={WalletDuotoneIcon} label="Open value" value={inr(d.openValue)} />
            <StatCard icon={ChartBarDuotoneIcon} label="Likely to close" value={inr(d.likelyValue)} />
          </div>
        )
      }
    />
  );
}
