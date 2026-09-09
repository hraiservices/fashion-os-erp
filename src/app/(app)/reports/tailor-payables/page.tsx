"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, AlertTriangle } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface TailorPayableRow {
  id: string;
  name: string;
  rangePayable: number;
  allTimePayable: number;
}

/** A garment carrying a payable whose `tailor` resolves to no employee — money that is owed to
 *  a real person but attributed to nobody, so it silently vanishes from every per-tailor total.
 *  Usually a legacy garment storing a typed NAME instead of the employee's id. */
interface UnattributedRow {
  orderId: string;
  rawTailor: string;
  amount: number;
}

/** Per-tailor rollup of what each piece-rate tailor is owed — a garment counts the moment its
 *  order is received and a tailor is assigned (payableAmount is live-recalculated from the
 *  current tailor rate card on every edit, see add_early_tailor_payables.sql /
 *  add_tailor_rate_versions.sql) and keeps counting straight through to Ready and payroll
 *  confirmation — no separate "pending" vs "confirmed" split to read. Confirming a payable
 *  happens on the order/work-order detail page, not here. */
export default function TailorPayablesPage() {
  const { data: user } = useCurrentUser();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: workOrders, isLoading: woLoading } = useWorkOrders();
  const isLoading = employeesLoading || ordersLoading || woLoading;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const { rows, unattributed, zeroRatedCount } = useMemo(() => {
    const tailors = (employees || []).filter((e) => e.pieceRateEligible);

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
        let rangePayable = 0;
        let allTimePayable = 0;
        for (const o of orders || []) {
          // Counted the moment the order was received, not when the garment reaches Ready —
          // in_date is the business date the shop treats as "received".
          const inRange = isWithinDateRange(o.inDate, range);
          for (const g of o.garments) {
            if (g.tailor !== t.id || !g.payableAmount) continue;
            allTimePayable += g.payableAmount;
            if (inRange) rangePayable += g.payableAmount;
          }
        }
        for (const w of workOrders || []) {
          if (w.tailor !== t.id || !w.laborCost) continue;
          allTimePayable += w.laborCost;
          if (isWithinDateRange(w.completedAt, range)) rangePayable += w.laborCost;
        }
        return {
          id: t.id,
          name: t.name,
          rangePayable: Math.round(rangePayable * 100) / 100,
          allTimePayable: Math.round(allTimePayable * 100) / 100,
        };
      })
      .sort((a, b) => b.allTimePayable - a.allTimePayable);

    return { rows, unattributed, zeroRatedCount };
  }, [employees, orders, workOrders, range]);

  if (!user?.perms.managePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="Not available" description="Only payroll managers can view tailor payables." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const unattributedTotal = unattributed.reduce((s, u) => s + u.amount, 0);
  const rangeTotal = rows.reduce((s, r) => s + r.rangePayable, 0);
  const allTimeTotal = rows.reduce((s, r) => s + r.allTimePayable, 0);
  const exportRows = rows.map((r) => ({ Tailor: r.name, [`Payable (${DATE_RANGE_PRESET_LABELS[preset]})`]: r.rangePayable, "All-time total": r.allTimePayable }));

  return (
    <ReportShell
      title="Tailor Payables"
      description="What each tailor is owed — counted from the moment their order is received, not just once it's finished."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="tailor-payables"
          title="Tailor Payables"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Total in range: ${inr(rangeTotal)}`, `All-time total: ${inr(allTimeTotal)}`]}
        />
      }
    >
      <ReportFilterBar preset={preset} onPresetChange={setPreset} customFrom={customFrom} onCustomFromChange={setCustomFrom} customTo={customTo} onCustomToChange={setCustomTo} />

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No piece-rate tailors yet" description="Mark a tailor 'Piece-rate eligible' on their employee record to see them here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Tailor</Th>
              <Th align="right">Payable ({DATE_RANGE_PRESET_LABELS[preset]})</Th>
              <Th align="right">All-time total</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{inr(rangeTotal)}</Td>
              <Td align="right">{inr(allTimeTotal)}</Td>
            </ReportTotalsRow>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <Td className="font-medium">{r.name}</Td>
                <Td align="right">{inr(r.rangePayable)}</Td>
                <Td align="right" className="font-semibold">{inr(r.allTimePayable)}</Td>
              </tr>
            ))}
          </tbody>
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
