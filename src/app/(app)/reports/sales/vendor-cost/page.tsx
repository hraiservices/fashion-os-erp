"use client";

import { useMemo } from "react";
import { Truck, Info } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useProducts } from "@/hooks/use-products";
import { useVendors } from "@/hooks/use-vendors";
import { useProductLedgerWithRefs } from "@/hooks/use-inventory-ledger";
import { computeSaleVendorTrace, type PurchaseBillProductLine } from "@/lib/inventory";
import { purchaseItemType, purchaseItemId } from "@/lib/purchases";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow, MobileRecordGrid } from "@/components/ui/mobile-record-list";

interface VendorDue {
  vendorId: string | null;
  vendorName: string;
  billNumber: string | null;
  dueDate: string | null;
  amount: number;
}

interface InvoiceVendorRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  revenue: number;
  costAmount: number;
  margin: number;
  dues: VendorDue[];
}

/** Per sales invoice: revenue, FIFO-traced vendor cost basis, your margin, and exactly which
 *  vendor bill(s) — by how much, due when — fund that cost. Built from the same ledger-replay
 *  technique as Aging Inventory, but tracking what each sale actually consumed rather than
 *  what's left unsold. Product Sales only — stitching orders are made in-house, not bought
 *  from a vendor on credit. */
export default function SalesVendorCostPage() {
  const { data: invoices, isLoading: l1 } = useSalesInvoices();
  const { data: bills, isLoading: l2 } = usePurchaseBills();
  const { data: products, isLoading: l3 } = useProducts();
  const { data: vendors, isLoading: l4 } = useVendors();
  const { data: ledger, isLoading: l5 } = useProductLedgerWithRefs();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const isLoading = l1 || l2 || l3 || l4 || l5;

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const fallbackUnitCost = useMemo(() => new Map((products || []).map((p) => [p.id, p.costPrice || 0])), [products]);

  const rows = useMemo(() => {
    if (!invoices || !bills || !ledger) return [];

    // One bill line per (productId, bill) pair, oldest bill first — computeSaleVendorTrace
    // matches these positionally against the ledger's chronological 'purchase' entries for the
    // same product, so this ordering must mirror how stock actually arrived.
    const sortedBills = [...bills].sort((a, b) => a.billDate.localeCompare(b.billDate) || a.createdAt.localeCompare(b.createdAt));
    const billLinesByProduct = new Map<string, PurchaseBillProductLine[]>();
    for (const bill of sortedBills) {
      for (const item of bill.items) {
        if (purchaseItemType(item) !== "product") continue;
        const productId = purchaseItemId(item);
        if (!productId) continue;
        const line: PurchaseBillProductLine = { billId: bill.id, billNumber: bill.billNumber, vendorId: bill.vendorId, dueDate: bill.dueDate || null, unitCost: item.unitCost };
        const list = billLinesByProduct.get(productId);
        if (list) list.push(line);
        else billLinesByProduct.set(productId, [line]);
      }
    }

    const trace = computeSaleVendorTrace(ledger, billLinesByProduct, fallbackUnitCost);

    const invoiceRows: InvoiceVendorRow[] = [];
    for (const invoice of invoices) {
      const perProduct = trace.get(invoice.id);
      if (!perProduct) continue;

      let costAmount = 0;
      const duesByKey = new Map<string, VendorDue>();
      for (const [, allocations] of perProduct) {
        for (const alloc of allocations) {
          costAmount += alloc.costAmount;
          if (alloc.vendorId == null) continue; // no vendor bill funded this unit — nothing owed
          const key = `${alloc.vendorId}|${alloc.billNumber}|${alloc.dueDate}`;
          const existing = duesByKey.get(key);
          if (existing) existing.amount += alloc.costAmount;
          else duesByKey.set(key, { vendorId: alloc.vendorId, vendorName: vendorNameById.get(alloc.vendorId) || "Unknown vendor", billNumber: alloc.billNumber, dueDate: alloc.dueDate, amount: alloc.costAmount });
        }
      }
      if (costAmount === 0 && duesByKey.size === 0) continue;

      const revenue = invoice.items.reduce((s, i) => s + i.amount, 0);
      invoiceRows.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        revenue,
        costAmount: Math.round(costAmount * 100) / 100,
        margin: Math.round((revenue - costAmount) * 100) / 100,
        dues: Array.from(duesByKey.values()).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")),
      });
    }

    return invoiceRows.filter((r) => isWithinDateRange(r.invoiceDate, range)).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }, [invoices, bills, ledger, fallbackUnitCost, vendorNameById, range]);

  const totals = useMemo(
    () => ({
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      cost: rows.reduce((s, r) => s + r.costAmount, 0),
      margin: rows.reduce((s, r) => s + r.margin, 0),
      owed: rows.reduce((s, r) => s + r.dues.reduce((ds, d) => ds + d.amount, 0), 0),
    }),
    [rows]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Sale → Vendor Payable Traceability"
      description="Per sales invoice: what you sold it for, which vendor bill(s) supplied the stock (FIFO), what you owe that vendor, and when it's due."
      actions={
        <ReportActionsMenu
          rows={rows.flatMap((r) =>
            r.dues.length > 0
              ? r.dues.map((d) => ({ Invoice: r.invoiceNumber, Date: r.invoiceDate, Revenue: r.revenue, "Your margin": r.margin, Vendor: d.vendorName, Bill: d.billNumber || "", "Amount owed": d.amount, "Due date": d.dueDate || "" }))
              : [{ Invoice: r.invoiceNumber, Date: r.invoiceDate, Revenue: r.revenue, "Your margin": r.margin, Vendor: "", Bill: "", "Amount owed": 0, "Due date": "" }]
          )}
          filename="sale-vendor-traceability"
          title="Sale to Vendor Payable Traceability"
          summaryLines={[`Invoices: ${rows.length}`, `Total owed to vendors: ${inr(totals.owed)}`, `Total margin: ${inr(totals.margin)}`]}
        />
      }
    >
      <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Product Sales only — traces resold finished goods back to the purchase bill(s) that supplied them (oldest stock first). Stitching orders are made in-house, not bought from a vendor.
        </span>
      </div>

      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="No traceable product sales yet" description="Sell a product that was bought in on a vendor bill to see its payable trail here." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader boldTitle title="Total" value={inr(totals.margin)} showChevron={false} valueClassName="text-emerald-600 dark:text-emerald-400" />
              <MobileRecordRow label="Revenue" value={inr(totals.revenue)} />
              <MobileRecordRow label="Cost basis" value={inr(totals.cost)} />
              <MobileRecordRow label="Owed to vendors" value={inr(totals.owed)} valueClassName="text-red-600 dark:text-red-400" />
            </MobileRecordCard>
            {rows.map((r) => (
              <MobileRecordCard key={r.invoiceId}>
                <MobileRecordHeader boldTitle title={r.invoiceNumber} value={inr(r.margin)} showChevron={false} valueClassName="text-emerald-600 dark:text-emerald-400" />
                <MobileRecordGrid
                  items={[
                    { label: "Date", value: r.invoiceDate },
                    { label: "Revenue", value: inr(r.revenue) },
                    { label: "Cost basis", value: inr(r.costAmount) },
                  ]}
                />
                {r.dues.length === 0 ? (
                  <MobileRecordRow label="Vendor payable" value="No vendor bill traced" />
                ) : (
                  r.dues.map((d, i) => (
                    <MobileRecordRow
                      key={i}
                      label={`Owe ${d.vendorName}${d.billNumber ? ` (${d.billNumber})` : ""}`}
                      value={`${inr(d.amount)} due ${d.dueDate || "—"}`}
                      valueClassName="text-red-600 dark:text-red-400"
                    />
                  ))
                )}
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Date</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Cost basis</Th>
                  <Th align="right">Your margin</Th>
                  <Th>Owe vendor</Th>
                  <Th>Due date</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) =>
                  r.dues.length === 0 ? (
                    <tr key={r.invoiceId} className="hover:bg-muted/30">
                      <Td className="font-medium">{r.invoiceNumber}</Td>
                      <Td>{r.invoiceDate}</Td>
                      <Td align="right">{inr(r.revenue)}</Td>
                      <Td align="right">{inr(r.costAmount)}</Td>
                      <Td align="right" className="font-medium text-emerald-600 dark:text-emerald-400">{inr(r.margin)}</Td>
                      <Td className="text-muted-foreground">No vendor bill traced</Td>
                      <Td>—</Td>
                    </tr>
                  ) : (
                    r.dues.map((d, i) => (
                      <tr key={`${r.invoiceId}-${i}`} className="hover:bg-muted/30">
                        {i === 0 ? (
                          <>
                            <Td className="font-medium" rowSpan={r.dues.length}>{r.invoiceNumber}</Td>
                            <Td rowSpan={r.dues.length}>{r.invoiceDate}</Td>
                            <Td align="right" rowSpan={r.dues.length}>{inr(r.revenue)}</Td>
                            <Td align="right" rowSpan={r.dues.length}>{inr(r.costAmount)}</Td>
                            <Td align="right" rowSpan={r.dues.length} className="font-medium text-emerald-600 dark:text-emerald-400">{inr(r.margin)}</Td>
                          </>
                        ) : null}
                        <Td className="font-medium text-red-600 dark:text-red-400">{d.vendorName}{d.billNumber ? ` (${d.billNumber})` : ""} — {inr(d.amount)}</Td>
                        <Td>{d.dueDate || "—"}</Td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </ReportTable>
          </div>
        </>
      )}
    </ReportShell>
  );
}
