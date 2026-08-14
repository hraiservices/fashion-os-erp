"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Users, UserPlus, LayoutGrid, LayoutList, ArrowUpDown, Upload } from "lucide-react";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { computeSegments, type CustomerSegment } from "@/lib/customer-segments";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { CustomerCard } from "@/components/crm/customer-card";
import { CustomerListRow } from "@/components/crm/customer-list-row";
import { PaymentModal } from "@/components/orders/payment-modal";
import { BalanceDue } from "@/components/ui/money-text";
import { inr, fmtDateShort } from "@/lib/format";
import { loyaltyTier } from "@/lib/business-rules";
import { sumOrdersOutstanding } from "@/lib/balances";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

const ALL_TAGS = "__all__";
const ALL_SEGMENTS = "__all_segments__";
const tagFilterLabel = (v: unknown) => (v === ALL_TAGS ? "All tags" : String(v ?? ""));

type SortKey = "name" | "orders" | "spent" | "lastOrder" | "balance";

function CrmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profiles, isLoading } = useCustomerProfiles();
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const { data: allInvoices } = useSalesInvoices();
  const { data: allProducts } = useProducts();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(ALL_TAGS);
  const [segmentFilter, setSegmentFilter] = useState(ALL_SEGMENTS);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lastOrder");
  const [sortAsc, setSortAsc] = useState(false);

  // Legacy deep link — the "Add customer" flow used to be a modal opened via ?new=1.
  useEffect(() => {
    if (searchParams.get("new") === "1") router.replace("/crm/new");
  }, [searchParams, router]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  }

  const view = searchParams.get("view") === "list" ? "list" : "cards";
  function setView(v: "cards" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "list") params.set("view", "list");
    else params.delete("view");
    router.replace(`/crm${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const canAdd = user?.perms.manageCustomers || user?.role === "admin" || user?.role === "manager";

  const allTags = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [profiles]);

  // Derived customer segments (Phase 7) — computed fresh from live retail sales data, not
  // stored. Keyed by mobile since that's the join key sales_invoices uses.
  const segmentsByMobile = useMemo(() => {
    const map = new Map<string, CustomerSegment[]>();
    if (!allInvoices || !allProducts) return map;
    const productsById = new Map(allProducts.map((p) => [p.id, p]));
    const invoicesByMobile = new Map<string, typeof allInvoices>();
    for (const inv of allInvoices) {
      const list = invoicesByMobile.get(inv.customerMobile);
      if (list) list.push(inv);
      else invoicesByMobile.set(inv.customerMobile, [inv]);
    }
    for (const c of profiles) {
      map.set(c.mobile, computeSegments(invoicesByMobile.get(c.mobile) || [], productsById));
    }
    return map;
  }, [profiles, allInvoices, allProducts]);

  const segmentOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    segmentsByMobile.forEach((segs) => segs.forEach((s) => byKey.set(s.key, s.label)));
    return [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [segmentsByMobile]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = !q ? profiles : profiles.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q));
    if (tagFilter !== ALL_TAGS) list = list.filter((c) => c.tags.includes(tagFilter));
    if (segmentFilter !== ALL_SEGMENTS) list = list.filter((c) => (segmentsByMobile.get(c.mobile) || []).some((s) => s.key === segmentFilter));

    function lastOrderTime(c: (typeof profiles)[number]) {
      return c.orders.reduce((max, o) => Math.max(max, new Date(o.inDate).getTime() || 0), 0);
    }
    function outstanding(c: (typeof profiles)[number]) {
      return sumOrdersOutstanding(c.orders);
    }

    const sorted = [...list].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "name":
          diff = a.name.localeCompare(b.name);
          break;
        case "orders":
          diff = a.orders.length - b.orders.length;
          break;
        case "spent":
          diff = a.spent - b.spent;
          break;
        case "balance":
          diff = outstanding(a) - outstanding(b);
          break;
        case "lastOrder":
        default:
          diff = lastOrderTime(a) - lastOrderTime(b);
          break;
      }
      return sortAsc ? diff : -diff;
    });
    return sorted;
  }, [profiles, search, tagFilter, segmentFilter, segmentsByMobile, sortKey, sortAsc]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Customers"
        description={`${filtered.length} of ${profiles.length} customers`}
        actions={
          <>
            <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => setView("cards")}
                aria-pressed={view === "cards"}
                className={cn("flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:min-h-8", view === "cards" ? "bg-muted" : "text-muted-foreground")}
              >
                <LayoutGrid className="size-4" /> Cards
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={cn("flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:min-h-8", view === "list" ? "bg-muted" : "text-muted-foreground")}
              >
                <LayoutList className="size-4" /> List
              </button>
            </div>
            {canAdd && (
              <Button variant="outline" nativeButton={false} render={<Link href="/crm/import" />}>
                <Upload className="size-4" /> Import
              </Button>
            )}
            {canAdd && (
              <Button nativeButton={false} render={<Link href="/crm/new" />}>
                <UserPlus className="size-4" /> Add customer
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or mobile…"
            className="h-10 pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search customers"
          />
        </div>
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={(v) => v && setTagFilter(v)}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue>{tagFilterLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TAGS}>All tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {segmentOptions.length > 0 && (
          <Select value={segmentFilter} onValueChange={(v) => v && setSegmentFilter(v)}>
            <SelectTrigger className="h-10 w-44">
              <SelectValue>{(v: unknown) => (v === ALL_SEGMENTS ? "All segments" : segmentOptions.find(([k]) => k === v)?.[1] ?? String(v))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SEGMENTS}>All segments</SelectItem>
              {segmentOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No customers match your search" : "No customers yet"}
          description={
            search
              ? "Try a different name or mobile number."
              : canAdd
              ? 'Click "Add customer" to add your first customer, or create an order — customers are added automatically.'
              : "Customers are created automatically when you add their first order."
          }
        />
      ) : view === "list" ? (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Customer <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-center">
                    <button type="button" onClick={() => toggleSort("orders")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Stitch Orders <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button type="button" onClick={() => toggleSort("spent")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Spent <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => toggleSort("lastOrder")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Last order <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">
                    <button type="button" onClick={() => toggleSort("balance")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Balance <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <CustomerListRow
                    key={c.mobile}
                    cust={c}
                    loyaltyCfg={loyaltyCfg}
                    shop={shop}
                    onRecordPayment={user?.perms.managePayments ? (order: Order) => setPaymentOrder(order) : undefined}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((c) => (
            <CustomerCard key={c.mobile} cust={c} loyaltyCfg={loyaltyCfg} />
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && view === "list" && (
        <MobileRecordList>
          {filtered.map((c) => {
            const tier = loyaltyCfg?.enabled ? loyaltyTier(c.totalEarned, loyaltyCfg) : null;
            const outstanding = sumOrdersOutstanding(c.orders);
            const latestOrder = [...c.orders].sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime())[0];
            return (
              <MobileRecordCard key={c.mobile} href={`/crm/${c.mobile}`}>
                <MobileRecordHeader
                  title={c.name}
                  subtitle={c.mobile}
                  value={outstanding > 0 ? <BalanceDue amount={outstanding} suffix=" due" paidLabel="" /> : "—"}
                />
                <MobileRecordRow label="Stitch Orders" value={c.orders.length} />
                <MobileRecordRow label="Spent" value={inr(c.spent)} />
                <MobileRecordRow label="Last order" value={fmtDateShort(latestOrder?.inDate || "")} />
                <MobileRecordRow
                  label="Tier"
                  value={
                    tier ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.color }}>
                        {tier.label}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
      )}

      {paymentOrder && <PaymentModal order={paymentOrder} open={!!paymentOrder} onOpenChange={(v) => !v && setPaymentOrder(null)} />}
    </div>
  );
}

/** CRMView(), Stitching_Manager_Pro_v16.html ~line 6725. */
export default function CrmPage() {
  return (
    <Suspense fallback={<div className="space-y-4 p-4 sm:p-6"><Skeleton className="h-9 w-48" /><Skeleton className="h-10 w-full max-w-md" /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-44"/>)}</div></div>}>
      <CrmContent />
    </Suspense>
  );
}
