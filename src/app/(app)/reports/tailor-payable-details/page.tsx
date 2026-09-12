"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useActiveTailors, useTailorName } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { LINING_LABELS, type Lining } from "@/lib/business-rules";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

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
}

/** Per-garment breakdown of what each tailor is owed, one row per garment — the order/customer-
 *  level detail behind the Tailor Payables summary page's per-tailor totals. Same inclusion rule
 *  and same numbers as that page (a garment counts the moment its order is received and a tailor
 *  is assigned; payableAmount is live-recalculated until it's confirmed — see
 *  add_early_tailor_payables.sql / unfreeze_tailor_payables_at_ready.sql), just exploded down to
 *  the individual garment so a manager can see exactly which order and customer each payable
 *  came from, not only the per-tailor sum. Also includes manufacturing Work Orders' laborCost —
 *  omitting those would make this report's per-tailor totals silently disagree with the Tailor
 *  Payables summary page for any tailor who does both stitching and manufacturing work. Filtered
 *  on inDate for orders / completedAt for work orders, matching the summary page's "range"
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
      });
    }
    return out
      .filter((r) => tailorFilter === "all" || r.tailorId === tailorFilter)
      .sort((a, b) => (a.inDate < b.inDate ? 1 : a.inDate > b.inDate ? -1 : 0));
  }, [orders, workOrders, range, tailorFilter, tailorName]);

  const byTailor = useMemo(() => {
    const map = new Map<string, { tailorName: string; total: number; count: number }>();
    for (const r of rows) {
      const entry = map.get(r.tailorId) || { tailorName: r.tailorName, total: 0, count: 0 };
      entry.total += r.amount;
      entry.count += 1;
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

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const exportRows = rows.map((r) => ({
    Tailor: r.tailorName,
    Order: r.orderId,
    "Order Date": fmtDate(r.inDate),
    Customer: r.customerName,
    Garment: r.garmentType,
    Lining: r.lining,
    Qty: r.qty,
    Payable: r.amount,
  }));
  const summaryLines = [
    `Range: ${DATE_RANGE_PRESET_LABELS[preset]}`,
    `Garments: ${rows.length}`,
    `Total payable: ${inr(grandTotal)}`,
    ...byTailor.map((t) => `${t.tailorName}: ${inr(t.total)}`),
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
              <span className="ml-2 text-muted-foreground">({t.count})</span>
              <span className="ml-2 font-semibold">{inr(t.total)}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No payables in range" description="No garment with a tailor assigned falls in the selected date range/filter." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Order</Th>
                  <Th>Order Date</Th>
                  <Th>Customer</Th>
                  <Th>Tailor</Th>
                  <Th>Garment</Th>
                  <Th>Lining</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Payable</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={7}>Total</Td>
                  <Td align="right">{inr(grandTotal)}</Td>
                </ReportTotalsRow>
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-muted/30">
                    <Td>
                      <Link href={r.orderHref} className="text-primary hover:underline">
                        {r.orderId}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{fmtDate(r.inDate)}</Td>
                    <Td>{r.customerName}</Td>
                    <Td className="font-medium">{r.tailorName}</Td>
                    <Td>{r.garmentType}</Td>
                    <Td className="text-muted-foreground">{r.lining}</Td>
                    <Td align="right">{r.qty}</Td>
                    <Td align="right" className="font-medium">{inr(r.amount)}</Td>
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
              <MobileRecordCard key={r.key} href={r.orderHref}>
                <MobileRecordHeader title={r.tailorName} subtitle={`${r.orderId} · ${r.customerName}`} value={inr(r.amount)} />
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
