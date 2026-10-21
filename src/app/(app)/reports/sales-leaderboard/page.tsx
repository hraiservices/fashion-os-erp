"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import type { LeaderboardReportRow } from "@/lib/targets-types";
import { useTargetsMeta, useTargetsReport } from "@/hooks/use-targets";
import { useReportDateRange } from "@/lib/report-date-range";
import { targetsRange, TargetsReportView, LeadTypeReportFilter, type ReportColumn } from "@/components/targets/report-page";

const COLUMNS: ReportColumn<LeaderboardReportRow>[] = [
  { label: "Person", cell: (r) => r.name, exportValue: (r) => r.name },
  { label: "Sales ₹", align: "right", cell: (r) => inr(r.value), exportValue: (r) => r.value },
  { label: "Sales made", align: "right", cell: (r) => r.sales, exportValue: (r) => r.sales },
  { label: "Leads won", align: "right", cell: (r) => r.leadsWon, exportValue: (r) => r.leadsWon },
  { label: "Won value", align: "right", cell: (r) => inr(r.wonValue), exportValue: (r) => r.wonValue },
  { label: "Targets hit", align: "right", cell: (r) => r.targetsHit, exportValue: (r) => r.targetsHit },
  { label: "Incentive", align: "right", cell: (r) => inr(r.incentive), exportValue: (r) => r.incentive },
];

export default function SalesLeaderboardPage() {
  const dr = useReportDateRange("this-month");
  const meta = useTargetsMeta().data;
  const [typeFilter, setTypeFilter] = useState("");
  const q = useTargetsReport("leaderboard", targetsRange(dr.range), true, typeFilter);
  const rows = q.data?.rows ?? [];
  return (
    <TargetsReportView
      title="Sales Leaderboard"
      description="Who sold the most in the period. Invoices count for the sales person named on them; stitching orders count through the lead they came from. A Type filter narrows only the lead side — a plain sales invoice with no lead still counts."
      filename="sales-leaderboard"
      dateRange={dr}
      loading={q.isLoading}
      error={q.error?.message}
      above={<LeadTypeReportFilter types={meta?.leadTypes} value={typeFilter} onChange={setTypeFilter} />}
      rows={rows}
      columns={COLUMNS}
      rowKey={(r, i) => r.personId ?? `none-${i}`}
      summaryLines={[`People: ${rows.length}`, `Total sales: ${inr(rows.reduce((s, r) => s + r.value, 0))}`]}
      emptyTitle="No sales in this period"
    />
  );
}
