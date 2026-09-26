"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileMinus } from "lucide-react";
import { useSalesCreditNotes } from "@/hooks/use-sales-credit-notes";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

type CreditNoteRow = { id: string; creditNumber: string; date: string; invoiceId: string; total: number; reason?: string };

export default function CreditNoteDetailsPage() {
  const { data: creditNotes, isLoading: l1 } = useSalesCreditNotes();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const isLoading = l1 || l2;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [reason, setReason] = useState("all");

  const invoiceById = useMemo(() => new Map((invoices || []).map((i) => [i.id, i])), [invoices]);
  const reasons = useMemo(() => {
    const set = new Set((creditNotes || []).map((c) => c.reason).filter(Boolean));
    return Array.from(set).sort();
  }, [creditNotes]);
  const rows = useMemo(
    () => (creditNotes || []).filter((c) => isWithinDateRange(c.date, range)).filter((c) => reason === "all" || c.reason === reason),
    [creditNotes, range, reason]
  );
  const total = useMemo(() => rows.reduce((s, c) => s + c.total, 0), [rows]);

  const SORT_COMPARATORS: Record<string, (a: CreditNoteRow, b: CreditNoteRow) => number> = useMemo(
    () => ({
      creditNumber: (a, b) => a.creditNumber.localeCompare(b.creditNumber),
      date: (a, b) => a.date.localeCompare(b.date),
      customer: (a, b) => (invoiceById.get(a.invoiceId)?.customerName || "").localeCompare(invoiceById.get(b.invoiceId)?.customerName || ""),
      mobile: (a, b) => (invoiceById.get(a.invoiceId)?.customerMobile || "").localeCompare(invoiceById.get(b.invoiceId)?.customerMobile || ""),
      invoice: (a, b) => (invoiceById.get(a.invoiceId)?.invoiceNumber || "").localeCompare(invoiceById.get(b.invoiceId)?.invoiceNumber || ""),
      reason: (a, b) => (a.reason || "").localeCompare(b.reason || ""),
      amount: (a, b) => a.total - b.total,
    }),
    [invoiceById]
  );
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<CreditNoteRow>("sales-credit-notes", SORT_COMPARATORS, new Set(["amount"]));
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Credit Note Details"
      description="Every credit note issued against a Product Sales invoice — used to reduce a customer's balance without a cash refund."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((c) => ({
            "Credit#": c.creditNumber,
            Date: c.date,
            Customer: invoiceById.get(c.invoiceId)?.customerName || "",
            Mobile: invoiceById.get(c.invoiceId)?.customerMobile || "",
            Invoice: invoiceById.get(c.invoiceId)?.invoiceNumber || "",
            Amount: c.total,
            Reason: c.reason,
          }))}
          filename="credit-note-details"
          title="Credit Note Details"
          summaryLines={[`Credit notes: ${rows.length}`, `Total credited: ${inr(total)}`]}
        />
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Credit Notes" value={rows.length} icon={FileMinus} />
        <StatCard label="Total Credited" value={inr(total)} icon={FileMinus} />
      </div>

      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} credit note${rows.length === 1 ? "" : "s"}`}
        category={
          <Select value={reason} onValueChange={(v) => v && setReason(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{reason === "all" ? "All Reasons" : reason}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              {reasons.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={FileMinus} title="No credit notes yet" description="Credit notes issued against sales invoices will appear here." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(total)} showChevron={false} />
            </MobileRecordCard>
            {sortedRows.map((c) => {
              const inv = invoiceById.get(c.invoiceId);
              return (
                <MobileRecordCard key={c.id}>
                  <MobileRecordHeader title={c.creditNumber} subtitle={fmtDate(c.date)} value={inr(c.total)} showChevron={false} />
                  <MobileRecordRow label="Customer" value={inv?.customerName || "—"} />
                  <MobileRecordRow label="Mobile" value={inv?.customerMobile || "—"} />
                  <MobileRecordRow
                    label="Invoice"
                    value={
                      inv ? (
                        <Link href={`/sales/invoices/${inv.id}`} className="text-primary hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <MobileRecordRow label="Reason" value={c.reason || "—"} />
                </MobileRecordCard>
              );
            })}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="creditNumber" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Credit#</Th>
                  <Th sortKey="date" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Date</Th>
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th sortKey="invoice" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Invoice</Th>
                  <Th sortKey="reason" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Reason</Th>
                  <Th align="right" sortKey="amount" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={6}>Total</Td>
                  <Td align="right">{inr(total)}</Td>
                </ReportTotalsRow>
                {sortedRows.map((c) => {
                  const inv = invoiceById.get(c.invoiceId);
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <Td className="font-medium">{c.creditNumber}</Td>
                      <Td className="text-muted-foreground">{fmtDate(c.date)}</Td>
                      <Td>{inv?.customerName || "—"}</Td>
                      <Td className="text-muted-foreground">{inv?.customerMobile || "—"}</Td>
                      <Td>
                        {inv ? (
                          <Link href={`/sales/invoices/${inv.id}`} className="text-primary hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="max-w-40 truncate text-muted-foreground">{c.reason || "—"}</Td>
                      <Td align="right" className="font-medium">{inr(c.total)}</Td>
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
