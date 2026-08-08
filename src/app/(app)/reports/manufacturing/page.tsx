"use client";

import { useMemo } from "react";
import { Factory, Wallet, TrendingDown, Layers } from "lucide-react";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { WO_STATUS_LABELS, WO_STAGES } from "@/lib/manufacturing";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export default function ManufacturingReportPage() {
  const { data: workOrders, isLoading } = useWorkOrders();

  const statusCounts = useMemo(() => {
    const counts = { draft: 0, in_progress: 0, qc: 0, completed: 0 };
    (workOrders || []).forEach((w) => (counts[w.status] += 1));
    return counts;
  }, [workOrders]);

  const completed = useMemo(() => (workOrders || []).filter((w) => w.status === "completed"), [workOrders]);
  const totalProductionCost = useMemo(() => completed.reduce((s, w) => s + (w.totalCost || 0), 0), [completed]);
  const totalWastageCost = useMemo(() => completed.reduce((s, w) => s + (w.wastageCost || 0), 0), [completed]);
  const totalMaterialCost = useMemo(() => completed.reduce((s, w) => s + (w.materialCost || 0), 0), [completed]);
  const wastagePct = totalMaterialCost + totalWastageCost > 0 ? Math.round((totalWastageCost / (totalMaterialCost + totalWastageCost)) * 100) : 0;

  const byProduct = useMemo(() => {
    const map = new Map<string, { productName: string; woCount: number; qtyProduced: number; totalCost: number }>();
    completed.forEach((w) => {
      const row = map.get(w.productId) || { productName: w.productName, woCount: 0, qtyProduced: 0, totalCost: 0 };
      row.woCount += 1;
      row.qtyProduced += w.qtyToProduce;
      row.totalCost += w.totalCost || 0;
      map.set(w.productId, row);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, avgCostPerUnit: r.qtyProduced > 0 ? r.totalCost / r.qtyProduced : 0 }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [completed]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Manufacturing" description="Work order status, production cost and wastage">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active Work Orders" value={statusCounts.draft + statusCounts.in_progress + statusCounts.qc} icon={Factory} />
        <StatCard label="Production Cost" value={inr(totalProductionCost)} icon={Wallet} />
        <StatCard label="Wastage Cost" value={inr(totalWastageCost)} icon={TrendingDown} tone={totalWastageCost > 0 ? "warning" : "default"} />
        <StatCard label="Wastage %" value={`${wastagePct}%`} icon={Layers} tone={wastagePct > 10 ? "danger" : "default"} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">By status</h2>
        <div className="flex flex-wrap gap-2">
          {WO_STAGES.map((s) => (
            <Badge key={s} variant={s === "completed" ? "secondary" : "outline"}>
              {WO_STATUS_LABELS[s]}: {statusCounts[s]}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Cost per product (completed work orders)</h2>
        {byProduct.length === 0 ? (
          <EmptyState icon={Factory} title="No completed work orders yet" description="Cost breakdowns appear once a work order is completed." />
        ) : (
          <ReportTable>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Product</Th>
                <Th align="right">Work orders</Th>
                <Th align="right">Qty produced</Th>
                <Th align="right">Total cost</Th>
                <Th align="right">Avg cost/unit</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byProduct.map((p) => (
                <tr key={p.productName} className="hover:bg-muted/30">
                  <Td className="font-medium">{p.productName}</Td>
                  <Td align="right">{p.woCount}</Td>
                  <Td align="right">{p.qtyProduced}</Td>
                  <Td align="right">{inr(p.totalCost)}</Td>
                  <Td align="right">{inr(p.avgCostPerUnit)}</Td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        )}
      </div>
    </ReportShell>
  );
}
