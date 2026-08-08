"use client";

import { use } from "react";
import Link from "next/link";
import { Phone, Mail, MapPin, FileText, Receipt, ArrowLeft, ChevronRight } from "lucide-react";
import { useVendor } from "@/hooks/use-vendors";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { inr, fmtDate } from "@/lib/format";
import { PO_STATUS_LABELS, BILL_STATUS_LABELS } from "@/lib/purchases";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BalanceDue } from "@/components/ui/money-text";

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: vendor, isLoading } = useVendor(id);
  const { data: allOrders } = usePurchaseOrders();
  const { data: allBills } = usePurchaseBills();

  const orders = (allOrders || []).filter((o) => o.vendorId === id);
  const bills = (allBills || []).filter((b) => b.vendorId === id);
  const totalPayable = bills.reduce((s, b) => s + b.balance, 0);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-6">
        <EmptyState icon={Receipt} title="Vendor not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/vendors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vendors
      </Link>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h1 className="text-xl font-semibold tracking-tight">{vendor.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {vendor.mobile && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5" /> {vendor.mobile}
            </span>
          )}
          {vendor.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" /> {vendor.email}
            </span>
          )}
          {vendor.gstin && (
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" /> {vendor.gstin}
            </span>
          )}
        </div>
        {vendor.address && (
          <p className="mt-1 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" /> {vendor.address}
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
          <div className="bg-card p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{orders.length}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Purchase Orders</p>
          </div>
          <div className="bg-card p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{bills.length}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bills</p>
          </div>
          <div className="bg-card p-3 text-center">
            <BalanceDue amount={totalPayable} paidLabel={inr(totalPayable)} className="text-lg" />
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payable</p>
          </div>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Bills ({bills.length})</h2>
        </div>
        {bills.length === 0 ? (
          <EmptyState icon={Receipt} title="No bills yet" className="border-0" />
        ) : (
          <ul className="divide-y">
            {bills.map((b) => (
              <li key={b.id}>
                <Link href={`/purchases/bills/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{b.billNumber}</span>
                      <Badge variant={b.paymentStatus === "paid" ? "secondary" : "outline"}>{BILL_STATUS_LABELS[b.paymentStatus]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(b.billDate)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{inr(b.total)}</p>
                    {b.balance > 0 && <BalanceDue amount={b.balance} suffix=" due" paidLabel="" className="text-xs" />}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Purchase Orders ({orders.length})</h2>
        </div>
        {orders.length === 0 ? (
          <EmptyState icon={FileText} title="No purchase orders yet" className="border-0" />
        ) : (
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/purchases/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{o.poNumber}</span>
                      <Badge variant="outline">{PO_STATUS_LABELS[o.status]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(o.date)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(o.total)}</p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
