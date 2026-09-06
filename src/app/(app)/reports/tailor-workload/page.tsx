"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { getTailorWorkload } from "@/lib/analytics";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

const CAPACITY_STYLE: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Normal: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Overloaded: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function TailorWorkloadPage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const workload = useMemo(() => getTailorWorkload(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Tailor Workload" description="Who has capacity and who is overloaded right now">
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {workload.length === 0 ? (
        <EmptyState icon={Users} title="No workload data yet" description="Assign tailors to orders to see capacity here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Tailor</Th>
              <Th align="right">Active orders</Th>
              <Th align="right">Overdue</Th>
              <Th>Capacity</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {workload.map((t) => (
              <tr key={t.tailor} className="hover:bg-muted/30">
                <Td className="font-medium">{tailorName(t.tailor)}</Td>
                <Td align="right">{t.active}</Td>
                <Td align="right">{t.overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{t.overdue}</span> : "0"}</Td>
                <Td>
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${CAPACITY_STYLE[t.capacity]}`}>{t.capacity}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
