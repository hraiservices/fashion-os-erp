"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useCustomers } from "@/hooks/use-customers";
import { buildCustomerLedger } from "@/lib/customer-ledger";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { cn } from "@/lib/utils";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

type Filter = "all" | "due" | "paid";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "due", label: "Has due balance" },
  { value: "paid", label: "Fully paid" },
];

/** Point-in-time snapshot (current balances) — the date range filters the underlying orders
 *  and invoices (by inDate/invoiceDate) feeding each customer's ledger, per the earlier decision
 *  to apply the range everywhere for consistency. */
export default function CustomerBalancesPage() {
  const { data: orders, isLoading: l1 } = useOrders();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const { data: customers, isLoading: l3 } = useCustomers();
  const isLoading = l1 || l2 || l3;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const { data: shop } = useShopSettings();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () =>
      buildCustomerLedger(
        (orders || []).filter((o) => isWithinDateRange(o.inDate, range)),
        (invoices || []).filter((i) => isWithinDateRange(i.invoiceDate, range)),
        customers || []
      ),
    [orders, invoices, customers, range]
  );

  function reminderUrl(name: string, mobile: string, due: number) {
    const text = `Dear *${name || "Customer"}* 🙏\n\n₹${due} is due on your account at *${shop?.name || "our company"}*.\nPlease clear at your earliest convenience.\n📞 ${shop?.phone || ""}`;
    return `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(text)}`;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.mobile.includes(q))
      .filter((r) => (filter === "due" ? r.totalDue > 0 : filter === "paid" ? r.totalDue === 0 : true));
  }, [rows, search, filter]);

  const totals = useMemo(
    () => filtered.reduce((acc, r) => ({ stitchDue: acc.stitchDue + r.stitchDue, salesDue: acc.salesDue + r.salesDue, totalDue: acc.totalDue + r.totalDue }), { stitchDue: 0, salesDue: 0, totalDue: 0 }),
    [filtered]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Customer Balances" description="Stitching order dues and product sales dues, shown separately, per customer">
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search name or mobile…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Customer</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Invoices</Th>
              <Th align="right">Stitch Due</Th>
              <Th align="right">Product Sales Due</Th>
              <Th align="right">Total Due</Th>
              <Th align="right">Lifetime</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.mobile} className="hover:bg-muted/30">
                <Td className="font-medium">
                  <Link href={`/crm/${r.mobile}`} className="hover:underline">
                    {r.name || r.mobile}
                  </Link>
                </Td>
                <Td align="right">{r.orderCount}</Td>
                <Td align="right">{r.invoiceCount}</Td>
                <Td align="right">{r.stitchDue > 0 ? <BalanceDue amount={r.stitchDue} /> : "—"}</Td>
                <Td align="right">{r.salesDue > 0 ? <BalanceDue amount={r.salesDue} /> : "—"}</Td>
                <Td align="right" className="font-semibold">
                  {r.totalDue > 0 ? <BalanceDue amount={r.totalDue} /> : "—"}
                </Td>
                <Td align="right" className="text-muted-foreground">
                  {inr(r.lifetime)}
                </Td>
                <Td align="right">
                  {r.totalDue > 0 && <WhatsAppIconButton href={reminderUrl(r.name, r.mobile, r.totalDue)} label={`Payment reminder to ${r.name || r.mobile}`} />}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.stitchDue)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.salesDue)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.totalDue)}</td>
              <td className="px-3 py-2.5" />
            </tr>
          </tfoot>
        </ReportTable>
      )}
    </ReportShell>
  );
}
