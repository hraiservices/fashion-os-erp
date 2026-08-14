"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, Plus, Pencil, Trash2, Gift, Receipt, ArrowLeft, ChevronRight, Mail, MapPin, Cake, Heart, ShoppingBag, FileText } from "lucide-react";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDeleteCustomerAndOrders, useGiveLoyaltyBonus } from "@/hooks/use-customer-mutations";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { loyaltyTier, normalizeIndianMobile } from "@/lib/business-rules";
import { LOYALTY_TYPE_LABELS, type LoyaltyHistoryEntry } from "@/lib/crm";
import { INVOICE_STATUS_LABELS } from "@/lib/sales";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { inr, fmtDate } from "@/lib/format";
import { sumOrdersOutstanding } from "@/lib/balances";
import { StageBadge, DueBadge } from "@/components/orders/stage-badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { EditCustomerModal } from "@/components/crm/edit-customer-modal";
import { CustomerMeasurements } from "@/components/crm/customer-measurements";
import { CustomerBuyingProfileCard } from "@/components/crm/customer-buying-profile-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** CustProfile(), Stitching_Manager_Pro_v16.html ~line 7443. */
export default function CustomerProfilePage({ params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = use(params);
  const router = useRouter();
  const { profiles, isLoading } = useCustomerProfiles();
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const { data: user } = useCurrentUser();
  const deleteCustomer = useDeleteCustomerAndOrders();
  const giveBonus = useGiveLoyaltyBonus();
  const { data: allInvoices } = useSalesInvoices();
  const { data: shop } = useShopSettings();

  const [editOpen, setEditOpen] = useState(false);
  const [bonusInput, setBonusInput] = useState("");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const cust = profiles.find((c) => c.mobile === mobile);
  if (!cust) {
    return (
      <div className="p-6">
        <EmptyState icon={Receipt} title="Customer not found" action={<Button nativeButton={false} render={<Link href="/crm" />}>Back to customers</Button>} />
      </div>
    );
  }

  const custOrders = [...cust.orders].sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime());
  // Outstanding balance — same semantics as the Dashboard's Balance Due.
  const outstanding = sumOrdersOutstanding(custOrders);
  const activeCount = custOrders.filter((o) => o.status !== "delivered" && o.status !== "payment").length;

  // Sales invoices for this customer — same customers table as stitching, joined by mobile.
  // Stitch Due and Sales Due are always shown separately; only "Combined" totals merge them.
  const custInvoices = (allInvoices || [])
    .filter((i) => i.customerMobile === mobile)
    .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  const salesDue = custInvoices.reduce((s, i) => s + i.balance, 0);
  const salesSpent = custInvoices.reduce((s, i) => s + i.total, 0);
  const combinedDue = outstanding + salesDue;
  const combinedLifetime = cust.spent + salesSpent;
  const tel = `tel:+91${mobile.replace(/\D/g, "").replace(/^91/, "").slice(-10)}`;
  const reminderUrl = `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(
    `Dear *${cust.name}* 🙏\n\n₹${combinedDue} is due on your account at *${shop?.name || "our shop"}* (across orders and invoices).\nPlease clear at your earliest convenience.\n📞 ${shop?.phone || ""}`
  )}`;
  const tier = loyaltyCfg?.enabled ? loyaltyTier(cust.totalEarned, loyaltyCfg) : null;
  const history = (cust.loyaltyHistory as unknown as LoyaltyHistoryEntry[]) || [];
  const initial = cust.name?.[0]?.toUpperCase() || "?";

  async function doDelete() {
    try {
      await deleteCustomer.mutateAsync({ mobile, name: cust!.name, custId: cust!.custId, userEmail: user?.email });
      toast.success(`${cust!.name} and ${custOrders.length} order(s) deleted`);
      router.push("/crm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function doGiveBonus() {
    const pts = parseInt(bonusInput, 10) || 0;
    if (!pts) return;
    try {
      await giveBonus.mutateAsync({ mobile, name: cust!.name, pts });
      setBonusInput("");
      toast.success(`${pts} points added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to give bonus");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/crm" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{initial}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{cust.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <a href={tel} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <Phone className="size-3.5" /> {cust.mobile}
              </a>
              {cust.email && (
                <a href={`mailto:${cust.email}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <Mail className="size-3.5" /> {cust.email}
                </a>
              )}
            </div>
            {(cust.dob || cust.anniversary) && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {cust.dob && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Cake className="size-3.5" /> {new Date(cust.dob).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                )}
                {cust.anniversary && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Heart className="size-3.5" /> {new Date(cust.anniversary).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            )}
            {cust.address && (
              <p className="mt-1 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" /> {cust.address}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Lifetime value: <span className="font-medium text-foreground">{inr(combinedLifetime)}</span>
              <span className="text-muted-foreground"> (stitching {inr(cust.spent)} + product sales {inr(salesSpent)})</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-4">
          <div className="bg-card p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{custOrders.length}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stitch Orders</p>
          </div>
          <div className="bg-card p-3 text-center">
            <BalanceDue amount={outstanding} paidLabel={inr(outstanding)} className="text-lg" />
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stitch Due</p>
          </div>
          <div className="bg-card p-3 text-center">
            <BalanceDue amount={salesDue} paidLabel={inr(salesDue)} className="text-lg" />
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Product Sales Due</p>
          </div>
          <div className="bg-card p-3 text-center">
            <BalanceDue amount={combinedDue} paidLabel={inr(combinedDue)} className="text-lg" />
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Combined Due</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={`/orders/new?mobile=${cust.mobile}`} />} className="flex-1 sm:flex-none">
            <Plus className="size-4" /> New order
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={`/crm/${cust.mobile}/statement`} />} className="flex-1 sm:flex-none">
            <FileText className="size-4" /> Statement
          </Button>
          {combinedDue > 0 && <WhatsAppButton href={reminderUrl} label="Payment Reminder" className="flex-1 sm:flex-none" />}
          {user?.perms.manageCustomers && (
            <Button variant="outline" onClick={() => setEditOpen(true)} className="flex-1 sm:flex-none">
              <Pencil className="size-4" /> Edit
            </Button>
          )}
          {user?.perms.deleteCustomers && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" aria-label="Delete customer">
                    <Trash2 className="size-4" />
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {cust.name} and all {custOrders.length} order(s)?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone.
                    {outstanding > 0 && ` This customer still owes ${inr(outstanding)} on stitching orders — deleting erases that record.`}
                    {salesDue > 0 && ` They also owe ${inr(salesDue)} on sales invoices, which will remain on record separately.`}
                    {activeCount > 0 && ` ${activeCount} order(s) still in progress will be lost.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <CustomerBuyingProfileCard mobile={cust.mobile} />

      {cust.notes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 font-medium">Notes</p>
          {cust.notes}
        </div>
      )}

      {loyaltyCfg?.enabled && (
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Gift className="size-4" /> Loyalty
            </h2>
            {tier && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: tier.bg, color: tier.color }}>
                {tier.label}
              </span>
            )}
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{cust.loyaltyPoints}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current points</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">{cust.totalEarned}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lifetime earned</p>
              </div>
            </div>

            {user?.perms.manageCustomers && (
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="Bonus points…"
                  value={bonusInput}
                  onChange={(e) => setBonusInput(e.target.value)}
                  aria-label="Bonus points to give"
                />
                <Button disabled={giveBonus.isPending || !bonusInput} onClick={doGiveBonus}>
                  {giveBonus.isPending ? "…" : "Give"}
                </Button>
              </div>
            )}

            {history.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {history.slice(0, 5).map((h, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{LOYALTY_TYPE_LABELS[h.type] || h.type}</span>
                    <span className={`font-medium tabular-nums ${h.pts > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {h.pts > 0 ? "+" : ""}
                      {h.pts} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <CustomerMeasurements cust={cust} />

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Order history ({custOrders.length})</h2>
        </div>
        {custOrders.length === 0 ? (
          <EmptyState icon={Receipt} title="No orders yet" className="border-0" />
        ) : (
          <ul className="divide-y">
            {custOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{o.id}</span>
                      <StageBadge stage={o.status} size="sm" />
                      <DueBadge order={o} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {(o.garments || []).map((g) => g.type).join(", ") || "—"} · {fmtDate(o.inDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{inr(o.total)}</p>
                    {o.balance > 0 && <BalanceDue amount={o.balance} suffix=" due" paidLabel="" className="text-xs" />}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Product sales invoices ({custInvoices.length})</h2>
          {salesDue > 0 && <BalanceDue amount={salesDue} suffix=" due" paidLabel="" className="text-xs" />}
        </div>
        {custInvoices.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No product sales invoices yet" description="Products bought by this customer will appear here." className="border-0" />
        ) : (
          <ul className="divide-y">
            {custInvoices.map((inv) => (
              <li key={inv.id}>
                <Link href={`/sales/invoices/${inv.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{inv.invoiceNumber}</span>
                      <Badge variant={inv.paymentStatus === "paid" ? "secondary" : "outline"}>{INVOICE_STATUS_LABELS[inv.paymentStatus]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {inv.items.map((it) => it.productName).join(", ") || "—"} · {fmtDate(inv.invoiceDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{inr(inv.total)}</p>
                    {inv.balance > 0 && <BalanceDue amount={inv.balance} suffix=" due" paidLabel="" className="text-xs" />}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EditCustomerModal cust={cust} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
