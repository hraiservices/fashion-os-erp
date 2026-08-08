"use client";

import { useMemo, useState } from "react";
import { Download, Receipt, FileWarning } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { inr } from "@/lib/format";
import { exportCSV } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface RateGroup {
  key: string;
  gstType: GstType;
  taxRate: number;
  invoiceCount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export default function GstSummaryReportPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const monthInvoices = useMemo(() => (invoices || []).filter((i) => i.invoiceDate.startsWith(month)), [invoices, month]);

  const groups = useMemo(() => {
    const map = new Map<string, RateGroup>();
    monthInvoices.forEach((inv) => {
      const key = `${inv.gstType}-${inv.taxRate}`;
      const row = map.get(key) || { key, gstType: inv.gstType, taxRate: inv.taxRate, invoiceCount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
      row.invoiceCount += 1;
      row.taxableValue += inv.taxableAmount;
      row.cgst += inv.cgst;
      row.sgst += inv.sgst;
      row.igst += inv.igst;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => (a.gstType === b.gstType ? b.taxRate - a.taxRate : a.gstType.localeCompare(b.gstType)));
  }, [monthInvoices]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (acc, g) => ({
          invoiceCount: acc.invoiceCount + g.invoiceCount,
          taxableValue: acc.taxableValue + g.taxableValue,
          cgst: acc.cgst + g.cgst,
          sgst: acc.sgst + g.sgst,
          igst: acc.igst + g.igst,
        }),
        { invoiceCount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
      ),
    [groups]
  );
  const totalTax = totals.cgst + totals.sgst + totals.igst;

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="GST Summary"
      description="Outward-supply totals by tax rate, for your accountant — not a GSTR-1 filing artifact"
      actions={
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40" />
          {groups.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCSV(
                  groups.map((g) => ({
                    "GST Type": GST_TYPE_LABELS[g.gstType],
                    "Tax Rate %": g.taxRate,
                    Invoices: g.invoiceCount,
                    "Taxable Value": g.taxableValue,
                    CGST: g.cgst,
                    SGST: g.sgst,
                    IGST: g.igst,
                  })),
                  `gst_summary_${month}`
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
          )}
        </div>
      }
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex gap-2">
          <FileWarning className="size-4 shrink-0" />
          <p>
            This summarizes your recorded sales invoices by tax rate — it&apos;s a starting point for your accountant, not a validated GSTR-1 filing.
            Confirm HSN/SAC codes, place-of-supply, and any B2B/B2C split requirements before filing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Invoices" value={totals.invoiceCount} icon={Receipt} />
        <StatCard label="Taxable Value" value={inr(totals.taxableValue)} icon={Receipt} />
        <StatCard label="Total GST" value={inr(totalTax)} icon={Receipt} />
        <StatCard label="Total Billed" value={inr(totals.taxableValue + totalTax)} icon={Receipt} />
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices in this period" description="Pick a different month above." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>GST Type</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Invoices</Th>
              <Th align="right">Taxable Value</Th>
              <Th align="right">CGST</Th>
              <Th align="right">SGST</Th>
              <Th align="right">IGST</Th>
              <Th align="right">Total Tax</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((g) => (
              <tr key={g.key} className="hover:bg-muted/30">
                <Td className="font-medium">{GST_TYPE_LABELS[g.gstType]}</Td>
                <Td align="right">{g.taxRate}%</Td>
                <Td align="right">{g.invoiceCount}</Td>
                <Td align="right">{inr(g.taxableValue)}</Td>
                <Td align="right">{g.cgst > 0 ? inr(g.cgst) : "—"}</Td>
                <Td align="right">{g.sgst > 0 ? inr(g.sgst) : "—"}</Td>
                <Td align="right">{g.igst > 0 ? inr(g.igst) : "—"}</Td>
                <Td align="right" className="font-medium">{inr(g.cgst + g.sgst + g.igst)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2.5" colSpan={2}>Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{totals.invoiceCount}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.taxableValue)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.cgst)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.sgst)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.igst)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totalTax)}</td>
            </tr>
          </tfoot>
        </ReportTable>
      )}
    </ReportShell>
  );
}
