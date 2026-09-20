"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, AlertTriangle } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/lib/format";
import { isOrderReadyOrBeyond } from "@/lib/business-rules";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

interface TailorPayableRow {
  id: string;
  name: string;
  rangePayable: number;
  rangePending: number;
  rangeCompletedCount: number;
  rangeTotalCount: number;
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

/** Per-tailor rollup of what each piece-rate tailor is owed. payableAmount itself is still live-
 *  recalculated from the current tailor rate card the moment an order is received (see
 *  add_early_tailor_payables.sql / add_tailor_rate_versions.sql) and keeps updating straight
 *  through to payroll confirmation — that underlying system is unchanged. What changed is what
 *  this REPORT counts toward "Payable": only garments whose order has reached Ready/Delivered/
 *  Payment stage, per the owner's explicit ask to see what's actually earned so far, not what's
 *  still in progress. Garments still in Received/Cutting/Stitching/Finishing show up in
 *  rangePending instead — visible, not hidden, just not counted as payable yet. Confirming a
 *  payable for real payroll still happens on the order/work-order detail page, not here. */
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
        let rangePending = 0;
        let allTimePayable = 0;
        let rangeCompletedCount = 0;
        let rangeTotalCount = 0;
        for (const o of orders || []) {
          // in_date is the business date the shop treats as "received" — a garment enters the
          // range the moment its order is received, same as before. Whether it counts toward
          // rangePayable (completed) or rangePending (still in progress) depends on the order's
          // current stage, not on when it was received.
          const inRange = isWithinDateRange(o.inDate, range);
          const completed = isOrderReadyOrBeyond(o.status);
          for (const g of o.garments) {
            if (g.tailor !== t.id || !g.payableAmount) continue;
            if (completed) allTimePayable += g.payableAmount;
            if (inRange) {
              rangeTotalCount += 1;
              if (completed) {
                rangePayable += g.payableAmount;
                rangeCompletedCount += 1;
              } else {
                rangePending += g.payableAmount;
              }
            }
          }
        }
        for (const w of workOrders || []) {
          // Work orders only ever have a completedAt once finished, so they're always
          // already-completed work — never "pending" the way an in-progress order's garment is.
          if (w.tailor !== t.id || !w.laborCost) continue;
          allTimePayable += w.laborCost;
          if (isWithinDateRange(w.completedAt, range)) {
            rangePayable += w.laborCost;
            rangeCompletedCount += 1;
            rangeTotalCount += 1;
          }
        }
        return {
          id: t.id,
          name: t.name,
          rangePayable: Math.round(rangePayable * 100) / 100,
          rangePending: Math.round(rangePending * 100) / 100,
          rangeCompletedCount,
          rangeTotalCount,
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
  const rangePendingTotal = rows.reduce((s, r) => s + r.rangePending, 0);
  const allTimeTotal = rows.reduce((s, r) => s + r.allTimePayable, 0);
  const rangeCompletedCount = rows.reduce((s, r) => s + r.rangeCompletedCount, 0);
  const rangeTotalCount = rows.reduce((s, r) => s + r.rangeTotalCount, 0);
  const exportRows = rows.map((r) => ({
    Tailor: r.name,
    [`Completed (${DATE_RANGE_PRESET_LABELS[preset]})`]: `${r.rangeCompletedCount}/${r.rangeTotalCount}`,
    [`Payable (${DATE_RANGE_PRESET_LABELS[preset]})`]: r.rangePayable,
    Pending: r.rangePending,
    "All-time total": r.allTimePayable,
  }));

  return (
    <ReportShell
      title="Tailor Payables"
      description="What each tailor has actually earned — only garments whose order has reached Ready, Delivered, or Paid. Still-in-progress work shows separately as Pending."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="tailor-payables"
          title="Tailor Payables"
          summaryLines={[
            `Range: ${DATE_RANGE_PRESET_LABELS[preset]}`,
            `${rangeCompletedCount} of ${rangeTotalCount} garments completed in range`,
            `Actual payable (completed only): ${inr(rangeTotal)}`,
            `Still in progress (pending): ${inr(rangePendingTotal)}`,
            `All-time total: ${inr(allTimeTotal)}`,
          ]}
        />
      }
    >
      <ReportFilterBar preset={preset} onPresetChange={setPreset} customFrom={customFrom} onCustomFromChange={setCustomFrom} customTo={customTo} onCustomToChange={setCustomTo} />

      {rows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{rangeCompletedCount} of {rangeTotalCount}</span> garments in range are
          Ready/Delivered/Paid — actual payable for completed work is <span className="font-semibold text-foreground">{inr(rangeTotal)}</span>.
          {rangePendingTotal > 0 && ` ${inr(rangePendingTotal)} more is still in progress (Pending).`}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No piece-rate tailors yet" description="Mark a tailor 'Piece-rate eligible' on their employee record to see them here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Tailor</Th>
                  <Th align="right">Completed</Th>
                  <Th align="right">Payable ({DATE_RANGE_PRESET_LABELS[preset]})</Th>
                  <Th align="right">Pending</Th>
                  <Th align="right">All-time total</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rangeCompletedCount}/{rangeTotalCount}</Td>
                  <Td align="right">{inr(rangeTotal)}</Td>
                  <Td align="right">{inr(rangePendingTotal)}</Td>
                  <Td align="right">{inr(allTimeTotal)}</Td>
                </ReportTotalsRow>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <Td className="font-medium">{r.name}</Td>
                    <Td align="right" className="text-muted-foreground">{r.rangeCompletedCount}/{r.rangeTotalCount}</Td>
                    <Td align="right">{inr(r.rangePayable)}</Td>
                    <Td align="right" className="text-amber-700 dark:text-amber-400">{r.rangePending > 0 ? inr(r.rangePending) : "—"}</Td>
                    <Td align="right" className="font-semibold">{inr(r.allTimePayable)}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(allTimeTotal)} showChevron={false} />
              <MobileRecordRow label={`Payable (${DATE_RANGE_PRESET_LABELS[preset]})`} value={inr(rangeTotal)} />
              <MobileRecordRow label="Pending (in progress)" value={inr(rangePendingTotal)} />
              <MobileRecordRow label="Completed" value={`${rangeCompletedCount}/${rangeTotalCount}`} />
            </MobileRecordCard>
            {rows.map((r) => (
              <MobileRecordCard key={r.id}>
                <MobileRecordHeader title={r.name} value={inr(r.allTimePayable)} valueClassName="font-semibold" showChevron={false} />
                <MobileRecordRow label={`Payable (${DATE_RANGE_PRESET_LABELS[preset]})`} value={inr(r.rangePayable)} />
                {r.rangePending > 0 && <MobileRecordRow label="Pending (in progress)" value={inr(r.rangePending)} />}
                <MobileRecordRow label="Completed" value={`${r.rangeCompletedCount}/${r.rangeTotalCount}`} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
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
          <div className="hidden sm:block">
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
          <MobileRecordList>
            {unattributed.map((u, i) => (
              <MobileRecordCard key={`${u.orderId}-${i}`} href={`/orders/${u.orderId}`}>
                <MobileRecordHeader title={u.orderId} value={inr(u.amount)} />
                <MobileRecordRow label="Stored tailor" value={<span className="font-mono">{u.rawTailor}</span>} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </div>
      )}
    </ReportShell>
  );
}
