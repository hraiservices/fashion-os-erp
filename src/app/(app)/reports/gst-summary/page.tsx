"use client";

import { useMemo } from "react";
import { Receipt, FileWarning } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";

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
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange("this-month");

  // Drafts are not issued documents and carry no tax liability; credit notes reverse tax on a
  // sale that was refunded. Including drafts and ignoring credits overstated output tax on the
  // report used to file GSTR-1. Matches getCombinedMonthly's treatment (src/lib/combined-reports.ts).
  const monthInvoices = useMemo(
    () => (invoices || []).filter((i) => isWithinDateRange(i.invoiceDate, range) && i.docStatus !== "draft"),
    [invoices, range]
  );

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
        <ReportActionsMenu
          rows={groups.map((g) => ({
            "GST Type": GST_TYPE_LABELS[g.gstType],
            "Tax Rate %": g.taxRate,
            Invoices: g.invoiceCount,
            "Taxable Value": g.taxableValue,
            CGST: g.cgst,
            SGST: g.sgst,
            IGST: g.igst,
          }))}
          filename={`gst-summary-${DATE_RANGE_PRESET_LABELS[preset]}`}
          title="GST Summary"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Total GST: ${inr(totalTax)}`, `Taxable value: ${inr(totals.taxableValue)}`]}
        />
      }
    >
      <ReportFilterBar preset={preset} onPresetChange={setPreset} customFrom={customFrom} onCustomFromChange={setCustomFrom} customTo={customTo} onCustomToChange={setCustomTo} />

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
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(totalTax)} showChevron={false} />
            <MobileRecordGrid
              items={[
                { label: "Invoices", value: totals.invoiceCount },
                { label: "Taxable Value", value: inr(totals.taxableValue) },
                { label: "CGST", value: inr(totals.cgst) },
                { label: "SGST", value: inr(totals.sgst) },
                { label: "IGST", value: inr(totals.igst) },
                { label: "Total Tax", value: inr(totalTax) },
              ]}
            />
          </MobileRecordCard>
          {groups.map((g) => (
            <MobileRecordCard key={g.key}>
              <MobileRecordHeader
                title={GST_TYPE_LABELS[g.gstType]}
                subtitle={`${g.taxRate}%`}
                value={inr(g.cgst + g.sgst + g.igst)}
                showChevron={false}
              />
              <MobileRecordGrid
                items={[
                  { label: "Invoices", value: g.invoiceCount },
                  { label: "Taxable Value", value: inr(g.taxableValue) },
                  { label: "CGST", value: g.cgst > 0 ? inr(g.cgst) : "—" },
                  { label: "SGST", value: g.sgst > 0 ? inr(g.sgst) : "—" },
                  { label: "IGST", value: g.igst > 0 ? inr(g.igst) : "—" },
                ]}
              />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
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
            <ReportTotalsRow>
              <Td colSpan={2}>Total</Td>
              <Td align="right">{totals.invoiceCount}</Td>
              <Td align="right">{inr(totals.taxableValue)}</Td>
              <Td align="right">{inr(totals.cgst)}</Td>
              <Td align="right">{inr(totals.sgst)}</Td>
              <Td align="right">{inr(totals.igst)}</Td>
              <Td align="right">{inr(totalTax)}</Td>
            </ReportTotalsRow>
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
        </ReportTable>
        </div>
        </>
      )}
    </ReportShell>
  );
}
