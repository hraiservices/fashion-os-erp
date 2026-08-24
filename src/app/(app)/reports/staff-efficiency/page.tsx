"use client";

import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function StaffEfficiencyPage() {
  const { staffEff, isLoading } = useReportsData();
  const tailorName = useTailorName();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Staff Efficiency" description="Revenue per order and on-time delivery rate">
      {staffEff.length === 0 ? (
        <EmptyState icon={Users} title="No staff data yet" description="Assign tailors to orders to see efficiency here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Tailor</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Per order</Th>
              <Th>Efficiency</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staffEff.map((t) => (
              <tr key={t.tailor} className="hover:bg-muted/30">
                <Td className="font-medium">{tailorName(t.tailor)}</Td>
                <Td align="right">{t.total}</Td>
                <Td align="right">{inr(t.revenue)}</Td>
                <Td align="right">{inr(t.revPerOrder)}</Td>
                <Td>
                  <div className="flex min-w-24 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${t.efficiency >= 90 ? "bg-emerald-500" : t.efficiency >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${t.efficiency}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{t.efficiency}%</span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
