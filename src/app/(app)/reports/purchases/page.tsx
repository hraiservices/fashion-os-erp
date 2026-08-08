"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Truck, Receipt, AlertTriangle, Wallet, ChevronRight, Package, FileMinus, Clock } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { daysLeft } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { ReportShell } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

const SUB_REPORTS = [
  { href: "/reports/payables/vendor-balance-summary", label: "Vendor Balance Summary", description: "Billed, paid, and balance per vendor", icon: Truck },
  { href: "/reports/payables/aging-summary", label: "AP Aging Summary", description: "Payables grouped by overdue band", icon: Wallet },
  { href: "/reports/payables/aging-details", label: "AP Aging Details", description: "Every outstanding bill, ranked by overdue days", icon: AlertTriangle },
  { href: "/reports/payables/payable-details", label: "Payable Details", description: "Outstanding bills ranked by amount owed", icon: Wallet },
  { href: "/purchases/bills", label: "Bill Details", description: "Every purchase bill logged", icon: Receipt },
  { href: "/reports/payables/vendor-credits", label: "Vendor Credit Details", description: "Credit notes issued by vendors", icon: FileMinus },
  { href: "/purchases/payments", label: "Payments Made", description: "Every payment logged against a bill", icon: Clock },
  { href: "/purchases/orders", label: "Purchase Order Details", description: "Every purchase order raised", icon: Receipt },
  { href: "/reports/payables/po-by-vendor", label: "Purchase Orders by Vendor", description: "PO count and value per vendor", icon: Truck },
  { href: "/reports/payables/po-by-item", label: "Purchase Order By Item", description: "Qty and value ordered per raw material", icon: Package },
];

export default function PayableSummaryPage() {
  const { data: bills, isLoading } = usePurchaseBills();

  const totalBilled = useMemo(() => (bills || []).reduce((s, b) => s + b.total, 0), [bills]);
  const totalPayable = useMemo(() => (bills || []).reduce((s, b) => s + b.balance, 0), [bills]);
  const totalGst = useMemo(() => (bills || []).reduce((s, b) => s + b.cgst + b.sgst + b.igst, 0), [bills]);
  const overdueCount = useMemo(() => (bills || []).filter((b) => b.balance > 0 && b.dueDate && daysLeft(b.dueDate) < 0).length, [bills]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Payable Summary" description="Vendor spend, payables and bill aging, at a glance">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Billed" value={inr(totalBilled)} icon={Receipt} />
        <StatCard label="Total Payable" value={inr(totalPayable)} icon={Wallet} tone={totalPayable > 0 ? "warning" : "default"} />
        <StatCard label="GST Paid" value={inr(totalGst)} icon={Truck} />
        <StatCard label="Overdue Bills" value={overdueCount} icon={AlertTriangle} tone={overdueCount > 0 ? "danger" : "default"} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Detailed reports</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUB_REPORTS.map((r) => (
            <Link key={r.href} href={r.href} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <r.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.label}</p>
                <p className="truncate text-xs text-muted-foreground">{r.description}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </ReportShell>
  );
}
