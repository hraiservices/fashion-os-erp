"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FileMinus, Download } from "lucide-react";
import { useSalesCreditNotes } from "@/hooks/use-sales-credit-notes";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr, fmtDate } from "@/lib/format";
import { exportCSV } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function CreditNoteDetailsPage() {
  const { data: creditNotes, isLoading: l1 } = useSalesCreditNotes();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const isLoading = l1 || l2;

  const invoiceById = useMemo(() => new Map((invoices || []).map((i) => [i.id, i])), [invoices]);
  const rows = creditNotes || [];
  const total = useMemo(() => rows.reduce((s, c) => s + c.total, 0), [rows]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Credit Note Details"
      description="Every credit note issued against a Product Sales invoice — used to reduce a customer's balance without a cash refund."
      actions={
        rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCSV(
                rows.map((c) => ({
                  "Credit#": c.creditNumber,
                  Date: c.date,
                  Customer: invoiceById.get(c.invoiceId)?.customerName || "",
                  Invoice: invoiceById.get(c.invoiceId)?.invoiceNumber || "",
                  Amount: c.total,
                  Reason: c.reason,
                })),
                "credit_note_details"
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Credit Notes" value={rows.length} icon={FileMinus} />
        <StatCard label="Total Credited" value={inr(total)} icon={FileMinus} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileMinus} title="No credit notes yet" description="Credit notes issued against sales invoices will appear here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Credit#</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th>Invoice</Th>
              <Th>Reason</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((c) => {
              const inv = invoiceById.get(c.invoiceId);
              return (
                <tr key={c.id} className="hover:bg-muted/30">
                  <Td className="font-medium">{c.creditNumber}</Td>
                  <Td className="text-muted-foreground">{fmtDate(c.date)}</Td>
                  <Td>{inv?.customerName || "—"}</Td>
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
      )}
    </ReportShell>
  );
}
