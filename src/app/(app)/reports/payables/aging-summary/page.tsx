"use client";

import { useMemo } from "react";
import { Wallet, Download } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { daysLeft } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { exportCSV } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const BANDS = [
  { key: "current", label: "Not yet due" },
  { key: "d30", label: "1–30 days overdue" },
  { key: "d60", label: "31–60 days overdue" },
  { key: "d90plus", label: "60+ days overdue" },
] as const;

type BandKey = (typeof BANDS)[number]["key"];

function bandOf(daysOverdue: number): BandKey {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  return "d90plus";
}

export default function ApAgingSummaryPage() {
  const { data: bills, isLoading } = usePurchaseBills();

  const buckets = useMemo(() => {
    const map = new Map<BandKey, { count: number; total: number }>(BANDS.map((b) => [b.key, { count: 0, total: 0 }]));
    (bills || [])
      .filter((b) => b.balance > 0)
      .forEach((b) => {
        const daysOverdue = b.dueDate ? Math.max(0, -daysLeft(b.dueDate)) : 0;
        const band = map.get(bandOf(daysOverdue))!;
        band.count += 1;
        band.total += b.balance;
      });
    return map;
  }, [bills]);

  const totalPayable = useMemo(() => Array.from(buckets.values()).reduce((s, b) => s + b.total, 0), [buckets]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="AP Aging Summary"
      description="Outstanding payables grouped by how overdue they are."
      actions={
        totalPayable > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(BANDS.map((b) => ({ Band: b.label, Bills: buckets.get(b.key)!.count, Total: buckets.get(b.key)!.total })), "ap_aging_summary")}
          >
            <Download className="size-4" /> Export CSV
          </Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Payable" value={inr(totalPayable)} icon={Wallet} tone={totalPayable > 0 ? "warning" : "default"} />
      </div>

      {totalPayable === 0 ? (
        <EmptyState icon={Wallet} title="No outstanding bills" description="Everything is paid up." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Aging band</Th>
              <Th align="right">Bills</Th>
              <Th align="right">Amount</Th>
              <Th align="right">% of Payable</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {BANDS.map((b) => {
              const bucket = buckets.get(b.key)!;
              const pct = totalPayable > 0 ? (bucket.total / totalPayable) * 100 : 0;
              return (
                <tr key={b.key} className="hover:bg-muted/30">
                  <Td className="font-medium">{b.label}</Td>
                  <Td align="right">{bucket.count}</Td>
                  <Td align="right" className={b.key !== "current" && bucket.total > 0 ? "text-red-600 dark:text-red-400" : undefined}>
                    {inr(bucket.total)}
                  </Td>
                  <Td align="right" className="text-muted-foreground">{pct.toFixed(1)}%</Td>
                </tr>
              );
            })}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
