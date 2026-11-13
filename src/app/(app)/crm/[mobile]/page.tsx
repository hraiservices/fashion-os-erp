"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Phone, Plus, Pencil, Trash2, Gift, Receipt, ChevronDown, Mail, MapPin, Cake, Heart, FileText, Ticket, Shirt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReceiptDuotoneIcon } from "@/components/icons/duotone-icons";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useCustomerCredit } from "@/hooks/use-customer-credit";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDeleteCustomerAndOrders, useGiveLoyaltyBonus } from "@/hooks/use-customer-mutations";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useAllOrderPayments } from "@/hooks/use-order-payments";
import { useAllSalesPayments } from "@/hooks/use-sales-payments";
import { buildOrderPaymentRows, buildInvoicePaymentRows, sortPaymentRows } from "@/lib/payments-received";
import { useIssueReferralCoupon } from "@/hooks/use-referral-coupons";
import { printCoupon } from "@/lib/order-coupon";
import { loyaltyTier, normalizeIndianMobile, buildWardrobeSummaryUrl, daysLeft } from "@/lib/business-rules";
import { LOYALTY_TYPE_LABELS, type LoyaltyHistoryEntry } from "@/lib/crm";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { inr } from "@/lib/format";
import { sumOrdersOutstanding } from "@/lib/balances";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TasteNotesCard } from "@/components/crm/taste-notes-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailStatRow, DetailStatTile } from "@/components/ui/detail-stat-tile";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { EditCustomerModal } from "@/components/crm/edit-customer-modal";
import { CustomerMeasurements } from "@/components/crm/customer-measurements";
import { CustomerMeasurementProfiles } from "@/components/crm/customer-measurement-profiles";
import { CustomerBuyingProfileCard } from "@/components/crm/customer-buying-profile-card";
import { CustomerProductRecommendations } from "@/components/crm/customer-product-recommendations";
import { CustomerPhotoAvatar } from "@/components/crm/customer-photo-avatar";
import { CustomerSpendChart, buildCustomerSpendByMonth } from "@/components/crm/customer-spend-chart";
import { CustomerActivityTimeline } from "@/components/crm/customer-activity-timeline";
import { CustomerTransactions } from "@/components/crm/customer-transactions";
import { CustomerProfileLink } from "@/components/crm/customer-profile-link";
import { CustomerSidebarList } from "@/components/crm/customer-sidebar-list";
import { RecordPrevNext } from "@/components/ui/record-prev-next";
import { BackLink } from "@/components/ui/back-link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** CustProfile(), Stitching_Manager_Pro_v16.html ~line 7443. */
/** The tabs on the customer page that switch a panel in place (Statement is a separate page and opens instead). */
const TAB_KEYS = ["overview", "transactions", "measurements", "activity"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Tabs keep their natural width (flex-none) instead of stretching across the row, and each one's
 * tap area is stretched to the full height of the 44px row on a phone with an invisible overlay —
 * the trigger itself is only ~36px tall inside the list's padding, which is a fiddly target.
 */
const TAB_TRIGGER_CLASS = "flex-none px-3 sm:px-3 before:absolute before:inset-x-0 before:-inset-y-1";

/** useSearchParams (the selected tab lives in the URL) wants a Suspense boundary above it, so the page sits inside one. */
export default function CustomerProfilePage(props: { params: Promise<{ mobile: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4 sm:p-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <CustomerProfileView {...props} />
    </Suspense>
  );
}

function CustomerProfileView({ params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The tab is in the URL (?tab=transactions) so a refresh, the back button and a shared link all land on the same tab.
  const requestedTab = searchParams.get("tab");
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(requestedTab ?? "") ? (requestedTab as TabKey) : "overview";
  function onTabChange(value: unknown) {
    const next = String(value);
    if (next === "statement") {
      router.push(`/crm/${mobile}/statement`);
      return;
    }
    router.replace(next === "overview" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }
  const { profiles, isLoading } = useCustomerProfiles();
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const { data: user } = useCurrentUser();
  const deleteCustomer = useDeleteCustomerAndOrders();
  const giveBonus = useGiveLoyaltyBonus();
  const { data: allInvoices } = useSalesInvoices();
  const { data: allOrderPayments } = useAllOrderPayments();
  const { data: allSalesPayments } = useAllSalesPayments();
  const { data: shop } = useShopSettings();
  const { data: creditBalance } = useCustomerCredit(mobile);
  const issueCoupon = useIssueReferralCoupon();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bonusInput, setBonusInput] = useState("");
  // Accordion state — only the Loyalty card still folds, and it starts closed on mobile as before.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const cust = profiles.find((c) => c.mobile === mobile);
  if (!cust) {
    return (
      <div className="flex items-start gap-4 p-4 sm:p-6">
        <CustomerSidebarList profiles={profiles} invoices={allInvoices} activeMobile={mobile} />
        <div className="min-w-0 flex-1 p-2">
          <EmptyState icon={ReceiptDuotoneIcon} title="Customer not found" action={<Button nativeButton={false} render={<Link href="/crm" />}>Back to customers</Button>} />
        </div>
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

  // Every payment this customer has made, across stitching orders and product-sale invoices —
  // same row-building helpers as the Payments Received report, just pre-filtered to this
  // customer's own orders/invoices instead of the whole shop's ledger.
  const custOrderIds = new Set(custOrders.map((o) => o.id));
  const orderIdentityMap = new Map(custOrders.map((o) => [o.id, { name: o.name, mobile: o.mobile }]));
  const invoiceIdentityMap = new Map(custInvoices.map((i) => [i.id, { invoiceNumber: i.invoiceNumber, customerName: i.customerName }]));
  const custOrderPayments = buildOrderPaymentRows((allOrderPayments || []).filter((p) => custOrderIds.has(p.orderId)), orderIdentityMap);
  const custInvoicePayments = buildInvoicePaymentRows((allSalesPayments || []).filter((p) => p.customerMobile === mobile), invoiceIdentityMap);
  const paymentRows = sortPaymentRows([...custOrderPayments, ...custInvoicePayments], "desc");
  const totalPaid = paymentRows.reduce((s, r) => s + r.amount, 0);
  const combinedDue = outstanding + salesDue;
  const combinedLifetime = cust.spent + salesSpent;
  const tel = `tel:+91${mobile.replace(/\D/g, "").replace(/^91/, "").slice(-10)}`;
  const reminderUrl = `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(
    `Dear *${cust.name}* 🙏\n\n₹${combinedDue} is due on your account at *${shop?.name || "our company"}* (across orders and invoices).\nPlease clear at your earliest convenience.\n📞 ${shop?.phone || ""}`
  )}`;
  const wardrobeUrl = buildWardrobeSummaryUrl(mobile, cust.name, custOrders, shop);
  const tier = loyaltyCfg?.enabled ? loyaltyTier(cust.totalEarned, loyaltyCfg) : null;
  const history = (cust.loyaltyHistory as unknown as LoyaltyHistoryEntry[]) || [];
  const initial = cust.name?.[0]?.toUpperCase() || "?";
  const spendByMonth = buildCustomerSpendByMonth(custOrders, custInvoices);

  // Delivery-due badge — "2 orders due this week" (or an overdue-styled version) — a tailor's
  // staff scan for the delivery date first, not just payment due. Counts open orders (not yet
  // delivered/payment stage) due today through 7 days out, separately from any already overdue.
  const openOrdersWithDates = custOrders.filter((o) => o.status !== "delivered" && o.status !== "payment" && o.deliveryDate);
  const overdueCount = openOrdersWithDates.filter((o) => daysLeft(o.deliveryDate) < 0).length;
  const dueThisWeekCount = openOrdersWithDates.filter((o) => daysLeft(o.deliveryDate) >= 0 && daysLeft(o.deliveryDate) <= 7).length;
  const deliveryBadge =
    overdueCount > 0
      ? { text: `${overdueCount} order${overdueCount === 1 ? "" : "s"} overdue`, bg: "#FEE2E2", color: "#991B1B" }
      : dueThisWeekCount > 0
        ? { text: `${dueThisWeekCount} order${dueThisWeekCount === 1 ? "" : "s"} due this week`, bg: "#FEF3C7", color: "#92400E" }
        : null;

  async function doDelete() {
    try {
      await deleteCustomer.mutateAsync({ mobile, name: cust!.name, custId: cust!.custId, userEmail: user?.email });
      toast.success(`${cust!.name} and ${custOrders.length} order(s) deleted`);
      router.push("/crm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleGiveCoupon() {
    try {
      const res = await issueCoupon.mutateAsync(mobile);
      printCoupon(res.coupon, shop);
      toast.success(`Coupon ${res.coupon.code} issued and ready to print`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to issue coupon");
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
    <div className="flex items-start gap-4 p-4 sm:p-6">
      <CustomerSidebarList profiles={profiles} invoices={allInvoices} activeMobile={mobile} />
      <div className="min-w-0 flex-1 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackLink href="/crm">Customers</BackLink>
        <RecordPrevNext items={profiles.map((p) => ({ id: p.mobile, href: `/crm/${p.mobile}` }))} activeId={mobile} />
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <CustomerPhotoAvatar mobile={cust.mobile} photoPath={cust.photoPath} initial={initial} canEdit={!!user?.perms.manageCustomers} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{cust.name}</h1>
              {deliveryBadge && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: deliveryBadge.bg, color: deliveryBadge.color }}>
                  {deliveryBadge.text}
                </span>
              )}
            </div>
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
            <p className="mt-2 text-base font-bold text-emerald-600 dark:text-emerald-400">
              Lifetime value: {inr(combinedLifetime)}
              <span className="ml-1 text-xs font-normal"> (stitching {inr(cust.spent)} + product sales {inr(salesSpent)})</span>
            </p>
            <CustomerProfileLink mobile={cust.mobile} name={cust.name} />
            {/* Prepaid balance — e.g. a payment that outlived the order/invoice it was recorded
                against (see order DELETE route) and got converted here instead of being lost.
                Shown only when non-zero so most customers never see an empty "Credit: ₹0" line. */}
            {!!creditBalance && (
              <p className="mt-1 text-sm font-medium text-sky-600 dark:text-sky-400">
                Credit balance: {inr(creditBalance)} <span className="font-normal text-muted-foreground">(apply it from the Record Payment page)</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <DetailStatRow>
            <DetailStatTile value={custOrders.length} label="Stitch orders" />
            <DetailStatTile value={inr(outstanding)} label="Stitch due" tone={outstanding > 0 ? "due" : "default"} />
            <DetailStatTile
              value={inr(salesDue)}
              label={`Product sales due (${custInvoices.length} invoice${custInvoices.length === 1 ? "" : "s"})`}
              tone={salesDue > 0 ? "due" : "default"}
            />
            <DetailStatTile value={inr(combinedDue)} label="Combined due" tone={combinedDue > 0 ? "due" : "good"} />
          </DetailStatRow>
        </div>

        {/* Zoho-style: one primary "New Transaction" menu for the create actions, a couple of
            frequently-used actions visible directly (Statement, Remind), and everything else
            (Wardrobe, Coupon) tucked behind "More". Edit and Delete are always-visible buttons:
            they are the two things staff reach for most on this page, and hiding them in a menu
            made both a two-tap hunt. Mirrors QuickCreateMenu's grouped-dropdown pattern used elsewhere in the app. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button className="h-10 px-4" />}>
              <Plus className="size-4" /> New Transaction <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem render={<Link href={`/orders/new?mobile=${cust.mobile}`} />}>
                <Plus className="size-4" /> Order
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/orders/new?mobile=${cust.mobile}&type=alteration`} />}>
                <Plus className="size-4" /> Alteration
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/sales/invoices/new?mobile=${cust.mobile}`} />}>
                <Receipt className="size-4" /> Invoice
              </DropdownMenuItem>
              {user?.perms.managePayments && combinedDue > 0 && (
                <DropdownMenuItem render={<Link href={`/payments/new?customer=${encodeURIComponent(cust.mobile)}`} />}>
                  <Wallet className="size-4" /> Payment
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {user?.perms.managePayments && combinedDue > 0 && (
            <Button variant="outline" className="h-10" nativeButton={false} render={<Link href={`/payments/new?customer=${encodeURIComponent(cust.mobile)}`} />}>
              <Wallet className="size-4" /> Record Payment
            </Button>
          )}

          <Button variant="outline" className="h-10" nativeButton={false} render={<Link href={`/crm/${cust.mobile}/statement`} />}>
            <FileText className="size-4" /> Statement
          </Button>

          {combinedDue > 0 && (
            <WhatsAppButton href={reminderUrl} label="Remind" className="h-10" tone="reminder" />
          )}

          {user?.perms.manageCustomers && (
            <Button variant="outline" className="h-10" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}

          {/* Delete is always visible too, but styled as the destructive action it is — and kept
              last in the row, after the everyday buttons, so it is never the one under a thumb
              by accident. It still goes through the confirmation dialog below. */}
          {user?.perms.deleteCustomers && (
            <Button
              variant="outline"
              className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}

          {(custOrders.length > 0 || user?.perms.manageCustomers) && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="h-10 px-3" aria-label="More actions" />}>
                More <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {custOrders.length > 0 && (
                  <DropdownMenuItem render={<a href={wardrobeUrl} target="_blank" rel="noopener noreferrer" />}>
                    <Shirt className="size-4" /> Share wardrobe
                  </DropdownMenuItem>
                )}
                {user?.perms.manageCustomers && (
                  <DropdownMenuItem onClick={handleGiveCoupon} disabled={issueCoupon.isPending}>
                    <Ticket className="size-4" /> Give coupon
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
                <AlertDialogAction variant="destructive" onClick={doDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onTabChange}>
        {/* Zoho-style underline tabs. On a phone the row scrolls sideways inside itself (see TabsList) and the
            tabs keep their natural width instead of stretching, so none of the five labels is ever squeezed. */}
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          <TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>Overview</TabsTrigger>
          <TabsTrigger value="transactions" className={TAB_TRIGGER_CLASS}>Transactions</TabsTrigger>
          <TabsTrigger value="measurements" className={TAB_TRIGGER_CLASS}>Measurements</TabsTrigger>
          <TabsTrigger value="activity" className={TAB_TRIGGER_CLASS}>Activity</TabsTrigger>
          {/* Statement is its own page, so this one opens it instead of switching a panel (see onTabChange). */}
          <TabsTrigger value="statement" className={TAB_TRIGGER_CLASS}>Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-2">
      <CustomerSpendChart data={spendByMonth} />

      <CustomerBuyingProfileCard mobile={cust.mobile} />
      <CustomerProductRecommendations customer={cust} />

      {cust.notes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 font-medium">Notes</p>
          {cust.notes}
        </div>
      )}

      {loyaltyCfg?.enabled && (
        <section className="rounded-xl border bg-card">
          <CollapsibleSectionHeader
            title="Loyalty"
            icon={<Gift className="size-4 text-muted-foreground" />}
            trailing={
              tier && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: tier.bg, color: tier.color }}>
                  {tier.label}
                </span>
              )
            }
            collapsed={!openSections.has("loyalty")}
            onToggle={() => toggleSection("loyalty")}
          />
          <div className={cn(!openSections.has("loyalty") && "hidden", "space-y-3 p-4 sm:block")}>
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

            {user?.perms.awardLoyaltyPoints && (
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

          <TasteNotesCard mobile={mobile} />
        </TabsContent>

        <TabsContent value="transactions" className="pt-2">
          <CustomerTransactions
            mobile={mobile}
            orders={custOrders}
            invoices={custInvoices}
            payments={paymentRows}
            orderDue={outstanding}
            invoiceDue={salesDue}
            totalPaid={totalPaid}
            canRecordPayment={!!user?.perms.managePayments && combinedDue > 0}
          />
        </TabsContent>

        <TabsContent value="measurements" className="space-y-4 pt-2">
          <CustomerMeasurements cust={cust} />
          <CustomerMeasurementProfiles cust={cust} />
        </TabsContent>

        {/* Mounted only while its tab is open, so the activity feed is not fetched until someone asks for it. */}
        <TabsContent value="activity" className="pt-2">
          <CustomerActivityTimeline mobile={mobile} />
        </TabsContent>
      </Tabs>


      <EditCustomerModal cust={cust} open={editOpen} onOpenChange={setEditOpen} />
      </div>
    </div>
  );
}

/** Mobile-only accordion trigger for a section below — same pattern as the Order Detail page's
 *  own CollapsibleSectionHeader. The header row itself doubles as the toggle button.
 *  `sm:pointer-events-none` turns the click off on desktop/tablet (where the chevron is also
 *  hidden) rather than unmounting any handler, since the section's content stays forced open
 *  there regardless of `collapsed` (see each section's own "sm:block" override). */
function CollapsibleSectionHeader({
  title,
  subtitle,
  icon,
  trailing,
  collapsed,
  onToggle,
  alwaysCollapsible,
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  /** Zoho-style: stays collapsed by default on every breakpoint, not just mobile — unlike the
   *  usual pattern here where sm+ always forces the section open regardless of `collapsed`. */
  alwaysCollapsible?: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-2 border-b px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        className={cn("flex min-w-0 flex-1 items-center justify-between gap-2 text-left", !alwaysCollapsible && "sm:pointer-events-none")}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            {icon} {title}
          </h2>
          {subtitle}
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !alwaysCollapsible && "sm:hidden", !collapsed && "rotate-180")} />
      </button>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}
