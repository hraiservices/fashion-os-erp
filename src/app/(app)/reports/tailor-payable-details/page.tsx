"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useActiveTailors, useTailorName } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { LINING_LABELS, isOrderReadyOrBeyond, type Lining } from "@/lib/business-rules";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { ColumnCustomizerMenu } from "@/components/ui/column-customizer";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const PAYABLE_DETAILS_COLUMNS = [
  { key: "order", label: "Order", required: true },
  { key: "orderDate", label: "Order Date" },
  { key: "customer", label: "Customer", required: true },
  { key: "tailor", label: "Tailor", required: true },
  { key: "garment", label: "Garment" },
  { key: "lining", label: "Lining" },
  { key: "qty", label: "Qty" },
  { key: "payable", label: "Payable", required: true },
];

// Below 1920px (a 14" laptop) the full 8-column table feels cramped — Order Date/Garment/
// Lining/Qty are the least essential to have visible at a glance, so they default to hidden
// there and reappear automatically on a wider monitor (still one click away via Columns).
const PAYABLE_DETAILS_AUTO_HIDE = { belowWidth: 1920, keys: ["orderDate", "garment", "lining", "qty"] };

interface PayableRow {
  key: string;
  orderId: string;
  orderHref: string;
  inDate: string;
  customerName: string;
  tailorId: string;
  tailorName: string;
  garmentType: string;
  lining: string;
  qty: number;
  amount: number;
  /** Order not yet Ready/Delivered/Paid — still in progress, so not yet actually earned. Kept
   *  visible in the table (not filtered out) but excluded from every total, per the owner's
   *  explicit ask: pay only for completed work, but still see the full pipeline. */
  isPending: boolean;
}

/** Per-garment breakdown of what each tailor is owed, one row per garment — the order/customer-
 *  level detail behind the Tailor Payables summary page's per-tailor totals. Same inclusion rule
 *  and same numbers as that page: EVERY garment with a tailor assigned in range still appears
 *  here (payableAmount is still live-recalculated from the moment an order is received, exactly
 *  as before — see add_early_tailor_payables.sql / unfreeze_tailor_payables_at_ready.sql, neither
 *  of which changed), but only garments whose order has reached Ready/Delivered/Payment stage
 *  count toward any total — a report-display rule only, added per the owner's explicit ask to
 *  see "what's actually earned so far" without waiting on a payroll run, not a change to when a
 *  payable actually freezes/gets paid. Still-in-progress garments are shown marked "Pending"
 *  rather than hidden, so the full pipeline stays visible. Also includes manufacturing Work
 *  Orders' laborCost — omitting those would make this report's per-tailor totals silently
 *  disagree with the Tailor Payables summary page for any tailor who does both stitching and
 *  manufacturing work. Filtered on inDate for orders / completedAt for work orders, matching the
 *  summary page's "range"
 *  column for each. */
export default function TailorPayableDetailsPage() {
  const { data: user } = useCurrentUser();
  const { data: tailors, isLoading: tailorsLoading } = useActiveTailors();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: workOrders, isLoading: woLoading } = useWorkOrders();
  const tailorName = useTailorName();
  const isLoading = tailorsLoading || ordersLoading || woLoading;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [tailorFilter, setTailorFilter] = useState("all");
  const columnTable = useColumnVisibility("tailor-payable-details", PAYABLE_DETAILS_COLUMNS, PAYABLE_DETAILS_AUTO_HIDE);
  const isVisible = columnTable.isVisible;

  const rows = useMemo(() => {
    const out: PayableRow[] = [];
    for (const o of orders || []) {
      if (!isWithinDateRange(o.inDate, range)) continue;
      o.garments.forEach((g, i) => {
        const tid = (g.tailor as string) || "";
        if (!tid) return;
        out.push({
          key: g.lineId || `${o.id}-${i}`,
          orderId: o.id,
          orderHref: `/orders/${o.id}`,
          inDate: o.inDate,
          customerName: o.name,
          tailorId: tid,
          tailorName: tailorName(tid),
          garmentType: g.type,
          lining: o.orderType === "alteration" ? "—" : LINING_LABELS[(g.lining as Lining) || "s"] || g.lining || "",
          qty: g.no || 1,
          amount: g.payableAmount || 0,
          isPending: !isOrderReadyOrBeyond(o.status),
        });
      });
    }
    for (const w of workOrders || []) {
      if (!w.tailor || !w.laborCost || !isWithinDateRange(w.completedAt, range)) continue;
      out.push({
        key: `wo-${w.id}`,
        orderId: w.woNumber || w.id,
        orderHref: `/manufacturing/${w.id}`,
        inDate: w.completedAt || "",
        customerName: "— (Manufacturing)",
        tailorId: w.tailor,
        tailorName: tailorName(w.tailor),
        garmentType: w.productName,
        lining: "—",
        qty: w.qtyToProduce,
        amount: w.laborCost,
        // Work orders only ever enter this report once they have a completedAt (the filter
        // above), so they're always already-finished work — never "pending" the way an
        // in-progress stitching order's garment can be.
        isPending: false,
      });
    }
    return out
      .filter((r) => tailorFilter === "all" || r.tailorId === tailorFilter)
      .sort((a, b) => (a.inDate < b.inDate ? 1 : a.inDate > b.inDate ? -1 : 0));
  }, [orders, workOrders, range, tailorFilter, tailorName]);

  const byTailor = useMemo(() => {
    const map = new Map<string, { tailorName: string; total: number; completedCount: number; totalCount: number }>();
    for (const r of rows) {
      const entry = map.get(r.tailorId) || { tailorName: r.tailorName, total: 0, completedCount: 0, totalCount: 0 };
      entry.totalCount += 1;
      if (!r.isPending) {
        entry.total += r.amount;
        entry.completedCount += 1;
      }
      map.set(r.tailorId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  if (!user?.perms.managePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="Not available" description="Only payroll managers can view tailor payables." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const completedRows = rows.filter((r) => !r.isPending);
  const grandTotal = completedRows.reduce((s, r) => s + r.amount, 0);
  const exportRows = rows.map((r) => ({
    Tailor: r.tailorName,
    Order: r.orderId,
    "Order Date": fmtDate(r.inDate),
    Customer: r.customerName,
    Garment: r.garmentType,
    Lining: r.lining,
    Qty: r.qty,
    Status: r.isPending ? "Pending" : "Completed",
    Payable: r.isPending ? 0 : r.amount,
  }));
  const summaryLines = [
    `Range: ${DATE_RANGE_PRESET_LABELS[preset]}`,
    `Garments: ${completedRows.length} completed of ${rows.length} in range`,
    `Actual payable (completed only): ${inr(grandTotal)}`,
    ...byTailor.map((t) => `${t.tailorName}: ${t.completedCount}/${t.totalCount} completed — ${inr(t.total)}`),
  ];

  return (
    <ReportShell
      title="Tailor Payable Report"
      description="Every garment payable to a tailor, per order — with customer, order and per-tailor totals."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="tailor-payable-report"
          title="Tailor Payable Report"
          summaryLines={summaryLines}
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} garment${rows.length === 1 ? "" : "s"}`}
        category={
          <Select value={tailorFilter} onValueChange={(v) => v && setTailorFilter(v)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue>{tailorFilter === "all" ? "All Tailors" : tailorName(tailorFilter)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tailors</SelectItem>
              {(tailors || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {byTailor.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byTailor.map((t) => (
            <div key={t.tailorName} className="rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="font-medium">{t.tailorName}</span>
              <span className="ml-2 text-muted-foreground">
                ({t.completedCount}/{t.totalCount} completed)
              </span>
              <span className="ml-2 font-semibold">{inr(t.total)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{completedRows.length} of {rows.length}</span> garments in range are
        Ready/Delivered/Paid — actual payable for completed work is <span className="font-semibold text-foreground">{inr(grandTotal)}</span>.
        {rows.length - completedRows.length > 0 && ` The rest are still in progress and shown below marked "Pending".`}
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No payables in range" description="No garment with a tailor assigned falls in the selected date range/filter." />
      ) : (
        <>
          <div className="hidden justify-end sm:flex">
            <ColumnCustomizerMenu table={columnTable} />
          </div>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Order</Th>
                  {isVisible("orderDate") && <Th>Order Date</Th>}
                  <Th>Customer</Th>
                  <Th>Tailor</Th>
                  {isVisible("garment") && <Th>Garment</Th>}
                  {isVisible("lining") && <Th>Lining</Th>}
                  {isVisible("qty") && <Th align="right">Qty</Th>}
                  <Th align="right">Payable</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={3 + ["orderDate", "garment", "lining", "qty"].filter(isVisible).length}>Total</Td>
                  <Td align="right">{inr(grandTotal)}</Td>
                </ReportTotalsRow>
                {rows.map((r) => (
                  <tr key={r.key} className={`hover:bg-muted/30 ${r.isPending ? "opacity-60" : ""}`}>
                    <Td>
                      <Link href={r.orderHref} className="text-primary hover:underline">
                        {r.orderId}
                      </Link>
                    </Td>
                    {isVisible("orderDate") && <Td className="text-muted-foreground">{fmtDate(r.inDate)}</Td>}
                    <Td>{r.customerName}</Td>
                    <Td className="font-medium">{r.tailorName}</Td>
                    {isVisible("garment") && <Td>{r.garmentType}</Td>}
                    {isVisible("lining") && <Td className="text-muted-foreground">{r.lining}</Td>}
                    {isVisible("qty") && <Td align="right">{r.qty}</Td>}
                    <Td align="right" className="font-medium">
                      {r.isPending ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          Pending
                        </span>
                      ) : (
                        inr(r.amount)
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(grandTotal)} showChevron={false} />
            </MobileRecordCard>
            {rows.map((r) => (
              <MobileRecordCard key={r.key} href={r.orderHref} className={r.isPending ? "opacity-60" : ""}>
                <MobileRecordHeader
                  title={r.tailorName}
                  subtitle={`${r.orderId} · ${r.customerName}`}
                  value={
                    r.isPending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Pending</span>
                    ) : (
                      inr(r.amount)
                    )
                  }
                />
                <MobileRecordRow label="Order Date" value={fmtDate(r.inDate)} />
                <MobileRecordRow label="Garment" value={`${r.garmentType}${r.lining !== "—" ? ` (${r.lining})` : ""}`} />
                <MobileRecordRow label="Qty" value={r.qty} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
