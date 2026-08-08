"use client";

import { Shirt } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function GarmentAnalysisPage() {
  const { garStats, isLoading } = useReportsData();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const maxCount = Math.max(...garStats.map((g) => g.count), 1);

  return (
    <ReportShell title="Garment Analysis" description="Which garment types you stitch most">
      {garStats.length === 0 ? (
        <EmptyState icon={Shirt} title="No garment data yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Garment</Th>
              <Th>Share</Th>
              <Th align="right">Count</Th>
              <Th align="right">Revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {garStats.map((g) => (
              <tr key={g.type} className="hover:bg-muted/30">
                <Td className="font-medium">{g.type}</Td>
                <Td className="w-40">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                  </div>
                </Td>
                <Td align="right">{g.count}</Td>
                <Td align="right">{inr(g.rev)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
