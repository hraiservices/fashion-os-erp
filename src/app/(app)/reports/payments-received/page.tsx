"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Receipt, Scissors, Search } from "lucide-react";
import { useAllSalesPayments } from "@/hooks/use-sales-payments";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useAllOrderPayments } from "@/hooks/use-order-payments";
import { useOrders } from "@/hooks/use-orders";
import { buildInvoicePaymentRows, buildOrderPaymentRows, sortPaymentRows, type PaymentSource } from "@/lib/payments-received";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

const SOURCE_FILTERS: { key: "all" | PaymentSource; label: string }[] = [
  { key: "all", label: "All" },
  { key: "invoice", label: "Invoice" },
  { key: "stitching", label: "Stitching" },
];

const SOURCE_BADGE: Record<PaymentSource, { label: string; icon: typeof Receipt; className: string }> = {
  invoice: { label: "Invoice", icon: Receipt, className: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400" },
  stitching: { label: "Stitching", icon: Scissors, className: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
};

export default function PaymentsReceivedReportPage() {
  const { data: salesPayments, isLoading: l1 } = useAllSalesPayments();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const { data: orderPayments, isLoading: l3 } = useAllOrderPayments();
  const { data: orders, isLoading: l4 } = useOrders();
  const isLoading = l1 || l2 || l3 || l4;

  const [source, setSource] = useState<"all" | PaymentSource>("all");
  const [search, setSearch] = useState("");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    const invoiceByIdMap = new Map((invoices || []).map((i) => [i.id, { invoiceNumber: i.invoiceNumber, customerName: i.customerName }]));
    const orderByIdMap = new Map((orders || []).map((o) => [o.id, { name: o.name, mobile: o.mobile }]));
    const invoiceRows = buildInvoicePaymentRows(salesPayments || [], invoiceByIdMap);
    const orderRows = buildOrderPaymentRows(orderPayments || [], orderByIdMap);
    return sortPaymentRows([...invoiceRows, ...orderRows], "desc");
  }, [salesPayments, invoices, orderPayments, orders]);

  const filtered = useMemo(() => {
    let list = source === "all" ? rows : rows.filter((r) => r.source === source);
    list = list.filter((r) => isWithinDateRange(r.date, range));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.customerName.toLowerCase().includes(q) || r.customerMobile.includes(q) || r.reference.toLowerCase().includes(q) || r.method.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, source, search, range]);

  const totalAll = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalInvoice = useMemo(() => rows.filter((r) => r.source === "invoice").reduce((s, r) => s + r.amount, 0), [rows]);
  const totalStitching = useMemo(() => rows.filter((r) => r.source === "stitching").reduce((s, r) => s + r.amount, 0), [rows]);
  const totalFiltered = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Payments Received" description="Every payment collected across both stitching orders and product sales, in one list">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total Payments" value={inr(totalAll)} icon={Wallet} />
        <StatCard label="Invoice Payments" value={inr(totalInvoice)} icon={Receipt} />
        <StatCard label="Stitching Payments" value={inr(totalStitching)} icon={Scissors} />
      </div>

      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Payment source">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSource(f.key)}
              aria-pressed={source === f.key}
              className={cn("flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:min-h-8", source === f.key ? "bg-muted" : "text-muted-foreground")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs flex-1 min-w-40">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search customer, mobile, reference…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search payments" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title={search ? "No payments match your search" : "No payments recorded yet"} className="border-0" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th>Mobile</Th>
              <Th>Mode</Th>
              <Th>Source</Th>
              <Th>Reference</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => {
              const badge = SOURCE_BADGE[r.source];
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <Td className="text-muted-foreground">{fmtDate(r.date)}</Td>
                  <Td className="font-medium">{r.customerName || "—"}</Td>
                  <Td className="text-muted-foreground">{r.customerMobile || "—"}</Td>
                  <Td>{r.method}</Td>
                  <Td>
                    <Badge variant="outline" className={cn("gap-1", badge.className)}>
                      <badge.icon className="size-3" />
                      {badge.label}
                    </Badge>
                  </Td>
                  <Td>
                    <Link href={r.referenceHref} className="text-primary hover:underline">
                      {r.reference}
                    </Link>
                  </Td>
                  <Td align="right" className="tabular-nums">{inr(r.amount)}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2.5" colSpan={6}>Total{source !== "all" || search ? " (filtered)" : ""}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totalFiltered)}</td>
            </tr>
          </tfoot>
        </ReportTable>
      )}
    </ReportShell>
  );
}
