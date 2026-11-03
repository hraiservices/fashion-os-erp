"use client";

import { useMemo, useState } from "react";
import { Lock, TrendingUp, Wallet, Truck, Landmark } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useCombinedPl } from "@/hooks/use-combined-pl";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useProducts } from "@/hooks/use-products";
import { useProductLedgerWithRefs } from "@/hooks/use-inventory-ledger";
import { computeSaleVendorTrace, type PurchaseBillProductLine } from "@/lib/inventory";
import { purchaseItemType, purchaseItemId } from "@/lib/purchases";
import { istDateString } from "@/lib/ist-date";
import { inr } from "@/lib/format";
import { ReportShell } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Scissors, Layers } from "lucide-react";
import { toast } from "sonner";

/**
 * "Today's Snapshot" — a password-gated, admin-only report showing exactly four numbers per
 * section and nothing else: Profit, Vendor Payable, Net Profit (all three sections), plus
 * Expense on the Combined section only (expenses aren't tagged by sales channel, so they can't
 * honestly be split between Product Sales and Orders).
 *
 * Profit here is a gross figure — revenue minus the direct cost of what was sold/stitched today
 * — deliberately NOT netted against today's shop-wide expenses (that's the separate Expense
 * card). Net Profit = Profit − Vendor Payable only, per how this report was scoped.
 *
 * The password is a quick screen-lock for a shared device, not the real access control — this
 * page is already gated on viewFinancialReports below, same as every other admin-only report.
 */
export default function DailySnapshotPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [unlocked, setUnlocked] = useState(false);

  if (userLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!user?.perms.viewFinancialReports) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Lock} title="Not available" description="This report isn't available for your account." />
      </div>
    );
  }

  return (
    <ReportShell title="Today's Snapshot" description="Today's profit, expense, and vendor payable — nothing else.">
      {unlocked ? <SnapshotContent /> : <PasswordGate onUnlock={() => setUnlocked(true)} />}
    </ReportShell>
  );
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/reports/daily-snapshot/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Wrong password");
        return;
      }
      onUnlock();
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-12 max-w-xs space-y-4 text-center">
      <Lock className="mx-auto size-8 text-muted-foreground" />
      <div className="space-y-1.5 text-left">
        <Label htmlFor="snapshot-password">Password</Label>
        <Input id="snapshot-password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" className="w-full" disabled={checking || !password}>
        {checking ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}

interface SectionTotals {
  revenue: number;
  profit: number;
  vendorPayable: number;
  netProfit: number;
}

function SnapshotContent() {
  const today = istDateString();
  const range = { from: today, to: today };

  const { monthly, isLoading: l1 } = useCombinedPl(range);
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const { data: bills, isLoading: l3 } = usePurchaseBills();
  const { data: products, isLoading: l4 } = useProducts();
  const { data: ledger, isLoading: l5 } = useProductLedgerWithRefs();

  const isLoading = l1 || l2 || l3 || l4 || l5;

  const todayBucket = monthly[0];

  const fallbackUnitCost = useMemo(() => new Map((products || []).map((p) => [p.id, p.costPrice || 0])), [products]);
  const billById = useMemo(() => new Map((bills || []).map((b) => [b.id, b])), [bills]);

  // Vendor payable for exactly what sold today: same FIFO cost trace as the "Sale → Vendor
  // Payable" report, but a due only counts if the bill that funded it is STILL unpaid — the
  // base trace reports cost basis by bill regardless of whether that bill's since been settled,
  // which would overstate payable for a bill paid off after the sale.
  const vendorPayableToday = useMemo(() => {
    if (!invoices || !bills || !ledger) return 0;
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

    let payable = 0;
    for (const invoice of invoices) {
      if (invoice.invoiceDate !== today) continue;
      const perProduct = trace.get(invoice.id);
      if (!perProduct) continue;
      for (const [, allocations] of perProduct) {
        for (const alloc of allocations) {
          if (alloc.billId == null) continue; // no vendor bill funded this unit — nothing owed
          const bill = billById.get(alloc.billId);
          if (!bill || bill.balance <= 0) continue; // this bill's already settled
          payable += alloc.costAmount;
        }
      }
    }
    return Math.round(payable * 100) / 100;
  }, [invoices, bills, ledger, fallbackUnitCost, billById, today]);

  const productSales: SectionTotals = useMemo(() => {
    const revenue = todayBucket?.salesRevenue || 0;
    const profit = Math.round((revenue - (todayBucket?.cogs || 0)) * 100) / 100;
    return { revenue, profit, vendorPayable: vendorPayableToday, netProfit: Math.round((profit - vendorPayableToday) * 100) / 100 };
  }, [todayBucket, vendorPayableToday]);

  const orders: SectionTotals = useMemo(() => {
    const revenue = todayBucket?.stitchingRevenue || 0;
    const cost = (todayBucket?.stitchingCost || 0) + (todayBucket?.materialPurchases || 0) + (todayBucket?.laborCost || 0) + (todayBucket?.payrollCost || 0);
    const profit = Math.round((revenue - cost) * 100) / 100;
    // Stitching orders are made in-house, not bought from a vendor on credit — nothing payable.
    return { revenue, profit, vendorPayable: 0, netProfit: profit };
  }, [todayBucket]);

  const combined: SectionTotals = useMemo(
    () => ({
      revenue: productSales.revenue + orders.revenue,
      profit: Math.round((productSales.profit + orders.profit) * 100) / 100,
      vendorPayable: productSales.vendorPayable + orders.vendorPayable,
      netProfit: Math.round((productSales.profit + orders.profit - productSales.vendorPayable - orders.vendorPayable) * 100) / 100,
    }),
    [productSales, orders]
  );

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-8">
      <Section icon={ShoppingCart} title="Product Sales" totals={productSales} />
      <Section icon={Scissors} title="Orders (Stitching)" totals={orders} />
      <Section icon={Layers} title="Combined" totals={combined} expense={todayBucket?.expenseCost || 0} />
      <PasswordChangeForm />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  totals,
  expense,
}: {
  icon: typeof ShoppingCart;
  title: string;
  totals: SectionTotals;
  expense?: number;
}) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Profit" value={inr(totals.profit)} icon={TrendingUp} tone={totals.profit >= 0 ? "success" : "danger"} />
        {expense !== undefined && <StatCard label="Expense" value={inr(expense)} icon={Wallet} tone="warning" />}
        <StatCard label="Vendor Payable" value={inr(totals.vendorPayable)} icon={Truck} tone={totals.vendorPayable > 0 ? "warning" : "default"} />
        <StatCard label="Net Profit" value={inr(totals.netProfit)} icon={Landmark} tone={totals.netProfit >= 0 ? "success" : "danger"} />
      </div>
    </div>
  );
}

function PasswordChangeForm() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/reports/daily-snapshot/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to change password");
        return;
      }
      toast.success("Password changed");
      setOpen(false);
      setCurrent("");
      setNext("");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
        Change password
      </button>
    );
  }

  return (
    <form onSubmit={save} className="max-w-xs space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="snapshot-current-password" className="text-xs">Current password</Label>
        <Input id="snapshot-current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="snapshot-new-password" className="text-xs">New password</Label>
        <Input id="snapshot-new-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} className="h-9" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !current || !next}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
