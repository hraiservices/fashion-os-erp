"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Receipt, Scissors, Search } from "lucide-react";
import { useAllSalesPayments } from "@/hooks/use-sales-payments";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useAllOrderPayments } from "@/hooks/use-order-payments";
import { useOrders } from "@/hooks/use-orders";
import { buildInvoicePaymentRows, buildOrderPaymentRows, sortPaymentRows, type PaymentSource, type PaymentReceivedRow } from "@/lib/payments-received";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { useTableSort } from "@/hooks/use-table-sort";

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
  const [method, setMethod] = useState("all");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    const invoiceByIdMap = new Map((invoices || []).map((i) => [i.id, { invoiceNumber: i.invoiceNumber, customerName: i.customerName }]));
    const orderByIdMap = new Map((orders || []).map((o) => [o.id, { name: o.name, mobile: o.mobile }]));
    const invoiceRows = buildInvoicePaymentRows(salesPayments || [], invoiceByIdMap);
    const orderRows = buildOrderPaymentRows(orderPayments || [], orderByIdMap);
    return sortPaymentRows([...invoiceRows, ...orderRows], "desc");
  }, [salesPayments, invoices, orderPayments, orders]);

  const methods = useMemo(() => Array.from(new Set(rows.map((r) => r.method).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    let list = source === "all" ? rows : rows.filter((r) => r.source === source);
    list = list.filter((r) => isWithinDateRange(r.date, range));
    if (method !== "all") list = list.filter((r) => r.method === method);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.customerName.toLowerCase().includes(q) || r.customerMobile.includes(q) || r.reference.toLowerCase().includes(q) || r.method.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, source, search, range, method]);

  const totalAll = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalInvoice = useMemo(() => rows.filter((r) => r.source === "invoice").reduce((s, r) => s + r.amount, 0), [rows]);
  const totalStitching = useMemo(() => rows.filter((r) => r.source === "stitching").reduce((s, r) => s + r.amount, 0), [rows]);
  const totalFiltered = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  const sortComparators: Record<string, (a: PaymentReceivedRow, b: PaymentReceivedRow) => number> = {
    date: (a, b) => a.date.localeCompare(b.date),
    customer: (a, b) => a.customerName.localeCompare(b.customerName),
    mobile: (a, b) => a.customerMobile.localeCompare(b.customerMobile),
    method: (a, b) => a.method.localeCompare(b.method),
    source: (a, b) => SOURCE_BADGE[a.source].label.localeCompare(SOURCE_BADGE[b.source].label),
    reference: (a, b) => a.reference.localeCompare(b.reference),
    amount: (a, b) => a.amount - b.amount,
  };
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<PaymentReceivedRow>("payments-received", sortComparators, new Set(["amount"]));
  const sortedFiltered = applySort(filtered);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Payments Received"
      description="Every payment collected across both stitching orders and product sales, in one list"
      actions={
        <ReportActionsMenu
          rows={sortedFiltered.map((r) => ({ Date: fmtDate(r.date), Customer: r.customerName || "—", Mobile: r.customerMobile || "—", Mode: r.method, Source: SOURCE_BADGE[r.source].label, Reference: r.reference, Amount: r.amount }))}
          filename="payments-received"
          title="Payments Received"
          summaryLines={[`Payments: ${filtered.length}`, `Total: ${inr(totalFiltered)}`]}
        />
      }
    >
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
        category={
          <Select value={method} onValueChange={(v) => v && setMethod(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{method === "all" ? "All Methods" : method}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
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
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title={`Total${source !== "all" || search ? " (filtered)" : ""}`} value={inr(totalFiltered)} showChevron={false} />
            </MobileRecordCard>
            {sortedFiltered.map((r) => {
              const badge = SOURCE_BADGE[r.source];
              return (
                <MobileRecordCard key={r.id} href={r.referenceHref}>
                  <MobileRecordHeader title={r.customerName || "—"} subtitle={r.customerMobile || "—"} value={inr(r.amount)} />
                  <MobileRecordRow label="Date" value={fmtDate(r.date)} />
                  <MobileRecordRow label="Mode" value={r.method} />
                  <MobileRecordRow
                    label="Source"
                    value={
                      <Badge variant="outline" className={cn("gap-1", badge.className)}>
                        <badge.icon className="size-3" />
                        {badge.label}
                      </Badge>
                    }
                  />
                  <MobileRecordRow label="Reference" value={r.reference} />
                </MobileRecordCard>
              );
            })}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="date" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Date</Th>
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th sortKey="method" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mode</Th>
                  <Th sortKey="source" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Source</Th>
                  <Th sortKey="reference" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Reference</Th>
                  <Th align="right" sortKey="amount" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={6}>Total{source !== "all" || search ? " (filtered)" : ""}</Td>
                  <Td align="right">{inr(totalFiltered)}</Td>
                </ReportTotalsRow>
                {sortedFiltered.map((r) => {
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
            </ReportTable>
          </div>
        </>
      )}
    </ReportShell>
  );
}
