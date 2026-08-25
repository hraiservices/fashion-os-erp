"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, AlertTriangle } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { computeOrderPieceRatePay, computeWorkOrderPieceRatePay } from "@/lib/piece-rate";
import { istDateString, istDayBoundsUtc } from "@/lib/ist-date";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order, WorkOrder } from "@/lib/types";

interface TailorPayableRow {
  id: string;
  name: string;
  weekEarned: number;
  monthEarned: number;
  pending: number;
  unpaid: number;
  allTimeEarned: number;
}

/** A garment carrying a payable whose `tailor` resolves to no employee — money that is owed to
 *  a real person but attributed to nobody, so it silently vanishes from every per-tailor total.
 *  Usually a legacy garment storing a typed NAME instead of the employee's id. */
interface UnattributedRow {
  orderId: string;
  rawTailor: string;
  amount: number;
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

  const { rows, unattributed, zeroRatedCount } = useMemo(() => {
    const tailors = (employees || []).filter((e) => e.pieceRateEligible);

    // ready_at / completed_at are timestamptz (UTC instants); a plain "YYYY-MM-DD" string
    // compare would put anything finished between 00:00–05:30 IST into the previous
    // day/month. Compare against the real UTC instant that starts the IST day instead.
    const today = istDateString();
    const weekStartUtc = istDayBoundsUtc(istDateString(new Date(Date.now() - 6 * 86_400_000))).startUtc;
    const monthStartUtc = istDayBoundsUtc(`${today.slice(0, 7)}-01`).startUtc;

    const confirmedOrders = (orders || []).filter((o) => o.payablesConfirmedAt);
    const unconfirmedOrders = (orders || []).filter((o) => o.readyAt && !o.payablesConfirmedAt);
    // Still genuinely owed: confirmed but no payroll run has paid it out yet. This is the
    // number a payables report exists to show — "earned all-time" is NOT what you owe.
    const unpaidOrders = confirmedOrders.filter((o) => !o.pieceRatePaidAt);
    const confirmedWo = (workOrders || []).filter((w) => w.laborPayableConfirmedAt);
    const unconfirmedWo = (workOrders || []).filter((w) => w.completedAt && !w.laborPayableConfirmedAt);
    const unpaidWo = confirmedWo.filter((w) => !w.pieceRatePaidAt);

    const inWindow = (list: Order[], startUtc: string) => list.filter((o) => o.readyAt && o.readyAt >= startUtc);
    const woInWindow = (wos: WorkOrder[], startUtc: string) => wos.filter((w) => w.completedAt && w.completedAt >= startUtc);

    // Every garment payable whose tailor doesn't resolve to a real employee record.
    const employeeIds = new Set((employees || []).map((e) => e.id));
    const unattributed: UnattributedRow[] = [];
    let zeroRatedCount = 0;
    for (const o of orders || []) {
      for (const g of o.garments) {
        const t = (g.tailor as string) || "";
        if (!t) continue;
        if (!employeeIds.has(t)) {
          unattributed.push({ orderId: o.id, rawTailor: t, amount: g.payableAmount || 0 });
        } else if (o.readyAt && !g.payableAmount) {
          // Reached "ready" with a tailor assigned but no payable frozen — almost always
          // means the rate card had no entry for this garment type/lining at that moment.
          zeroRatedCount += 1;
        }
      }
    }

    const rows = tailors
      .map((t): TailorPayableRow => {
        const pendingOrders = unconfirmedOrders.reduce((s, o) => s + o.garments.filter((g) => g.tailor === t.id).reduce((s2, g) => s2 + (g.payableAmount || 0), 0), 0);
        const pendingWo = unconfirmedWo.filter((w) => w.tailor === t.id).reduce((s, w) => s + (w.laborCost || 0), 0);
        return {
          id: t.id,
          name: t.name,
          weekEarned:
            computeOrderPieceRatePay(t.id, inWindow(confirmedOrders, weekStartUtc)) + computeWorkOrderPieceRatePay(t.id, woInWindow(confirmedWo, weekStartUtc)),
          monthEarned:
            computeOrderPieceRatePay(t.id, inWindow(confirmedOrders, monthStartUtc)) + computeWorkOrderPieceRatePay(t.id, woInWindow(confirmedWo, monthStartUtc)),
          pending: Math.round((pendingOrders + pendingWo) * 100) / 100,
          unpaid: computeOrderPieceRatePay(t.id, unpaidOrders) + computeWorkOrderPieceRatePay(t.id, unpaidWo),
          allTimeEarned: computeOrderPieceRatePay(t.id, confirmedOrders) + computeWorkOrderPieceRatePay(t.id, confirmedWo),
        };
      })
      .sort((a, b) => b.unpaid - a.unpaid);

    return { rows, unattributed, zeroRatedCount };
  }, [employees, orders, workOrders]);

  if (!user?.perms.managePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="Not available" description="Only payroll managers can view tailor payables." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const unattributedTotal = unattributed.reduce((s, u) => s + u.amount, 0);

  return (
    <ReportShell
      title="Tailor Payables"
      description="Piece-rate earnings per tailor. 'Still owed' is what you actually have to pay — it excludes anything already paid out by a payroll run."
    >
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
              <Th align="right">Still owed</Th>
              <Th align="right">Earned, all-time</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <Td className="font-medium">{r.name}</Td>
                <Td align="right">{inr(r.weekEarned)}</Td>
                <Td align="right">{inr(r.monthEarned)}</Td>
                <Td align="right" className={r.pending > 0 ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
                  {inr(r.pending)}
                </Td>
                <Td align="right" className={r.unpaid > 0 ? "font-semibold text-red-600 dark:text-red-400" : "font-semibold"}>
                  {inr(r.unpaid)}
                </Td>
                <Td align="right" className="text-muted-foreground">{inr(r.allTimeEarned)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.weekEarned, 0))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.monthEarned, 0))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.pending, 0))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.unpaid, 0))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{inr(rows.reduce((s, r) => s + r.allTimeEarned, 0))}</td>
            </tr>
          </tfoot>
        </ReportTable>
      )}

      {zeroRatedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-900 dark:text-amber-200">
            <span className="font-medium">{zeroRatedCount} garment(s)</span> reached &quot;Ready&quot; with a tailor assigned but no payable amount — the Tailor Payable Rates card had no
            rate for that garment type/lining at the time. Those tailors are currently owed ₹0 for that work. Set the rates under Employees → Tailor Payable Rates, then run the
            re-snapshot migration to recalculate them.
          </p>
        </div>
      )}

      {unattributed.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm dark:bg-red-950/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-red-900 dark:text-red-200">
              <span className="font-medium">{inr(unattributedTotal)}</span> of payables across {unattributed.length} garment(s) are assigned to a tailor name that isn&apos;t linked to
              an employee record, so they belong to nobody and are missing from every total above. Open each order and re-select the tailor from the dropdown to fix it.
            </p>
          </div>
          <ReportTable>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Order</Th>
                <Th>Stored tailor</Th>
                <Th align="right">Payable</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {unattributed.map((u, i) => (
                <tr key={`${u.orderId}-${i}`} className="hover:bg-muted/30">
                  <Td>
                    <Link href={`/orders/${u.orderId}`} className="text-primary hover:underline">
                      {u.orderId}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">{u.rawTailor}</Td>
                  <Td align="right" className="tabular-nums">{inr(u.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </div>
      )}
    </ReportShell>
  );
}
