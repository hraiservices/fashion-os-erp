"use client";

import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { computeOrderPieceRatePay, computeWorkOrderPieceRatePay } from "@/lib/piece-rate";
import { istDateString } from "@/lib/ist-date";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order, WorkOrder } from "@/lib/types";

interface TailorPayableRow {
  id: string;
  name: string;
  weekConfirmed: number;
  monthConfirmed: number;
  pending: number;
  allTimeConfirmed: number;
}

/** Per-tailor rollup of piece-rate payables — read-mostly, mirrors the self-service portal's
 *  own earnings figures (src/app/api/attendance/earnings) but across every piece-rate-eligible
 *  employee at once. Confirming a payable happens on the order/work-order detail page, not here. */
export default function TailorPayablesPage() {
  const { data: user } = useCurrentUser();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: workOrders, isLoading: woLoading } = useWorkOrders();
  const isLoading = employeesLoading || ordersLoading || woLoading;

  const rows = useMemo(() => {
    const tailors = (employees || []).filter((e) => e.pieceRateEligible);
    if (tailors.length === 0) return [];

    const today = istDateString();
    const weekStart = istDateString(new Date(Date.now() - 6 * 86_400_000));
    const monthStart = `${today.slice(0, 7)}-01`;

    const confirmedOrders = (orders || []).filter((o) => o.payablesConfirmedAt);
    const unconfirmedOrders = (orders || []).filter((o) => o.readyAt && !o.payablesConfirmedAt);
    const confirmedWo = (workOrders || []).filter((w) => w.laborPayableConfirmedAt);
    const unconfirmedWo = (workOrders || []).filter((w) => w.completedAt && !w.laborPayableConfirmedAt);

    const inWindow = (orders: Order[], start: string) => orders.filter((o) => o.readyAt && o.readyAt >= start);
    const woInWindow = (wos: WorkOrder[], start: string) => wos.filter((w) => w.completedAt && w.completedAt >= start);

    return tailors
      .map((t): TailorPayableRow => {
        const pendingOrders = unconfirmedOrders.reduce((s, o) => s + o.garments.filter((g) => g.tailor === t.id).reduce((s2, g) => s2 + (g.payableAmount || 0), 0), 0);
        const pendingWo = unconfirmedWo.filter((w) => w.tailor === t.id).reduce((s, w) => s + (w.laborCost || 0), 0);
        return {
          id: t.id,
          name: t.name,
          weekConfirmed:
            computeOrderPieceRatePay(t.id, inWindow(confirmedOrders, weekStart)) + computeWorkOrderPieceRatePay(t.id, woInWindow(confirmedWo, weekStart)),
          monthConfirmed:
            computeOrderPieceRatePay(t.id, inWindow(confirmedOrders, monthStart)) + computeWorkOrderPieceRatePay(t.id, woInWindow(confirmedWo, monthStart)),
          pending: Math.round((pendingOrders + pendingWo) * 100) / 100,
          allTimeConfirmed: computeOrderPieceRatePay(t.id, confirmedOrders) + computeWorkOrderPieceRatePay(t.id, confirmedWo),
        };
      })
      .sort((a, b) => b.allTimeConfirmed - a.allTimeConfirmed);
  }, [employees, orders, workOrders]);

  if (!user?.perms.managePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="Not available" description="Only payroll managers can view tailor payables." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Tailor Payables" description="Piece-rate earnings per tailor — confirm payables from the order or work-order detail page">
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No piece-rate tailors yet" description="Mark a tailor 'Piece-rate eligible' on their employee record to see them here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Tailor</Th>
              <Th align="right">This week</Th>
              <Th align="right">This month</Th>
              <Th align="right">Awaiting confirmation</Th>
              <Th align="right">Confirmed, all-time</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <Td className="font-medium">{r.name}</Td>
                <Td align="right">{inr(r.weekConfirmed)}</Td>
                <Td align="right">{inr(r.monthConfirmed)}</Td>
                <Td align="right" className={r.pending > 0 ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
                  {inr(r.pending)}
                </Td>
                <Td align="right" className="font-semibold">{inr(r.allTimeConfirmed)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
