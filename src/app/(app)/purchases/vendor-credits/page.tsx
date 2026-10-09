"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Undo2, ChevronRight, Search } from "lucide-react";
import { useVendorCredits } from "@/hooks/use-vendor-credits";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function VendorCreditsPage() {
  const { data: credits, isLoading } = useVendorCredits();
  const { data: vendors } = useVendors();
  const { data: bills } = usePurchaseBills();
  const [search, setSearch] = useState("");

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const billNumberById = useMemo(() => new Map((bills || []).map((b) => [b.id, b.billNumber])), [bills]);
  const totalCredited = useMemo(() => (credits || []).reduce((s, c) => s + c.total, 0), [credits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return credits || [];
    return (credits || []).filter((c) => c.creditNumber.toLowerCase().includes(q) || (vendorNameById.get(c.vendorId) || "").toLowerCase().includes(q));
  }, [credits, vendorNameById, search]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Vendor Credits" description={`${filtered.length} of ${credits?.length ?? 0} credits · ${inr(totalCredited)} total returned`} />

      {!isLoading && credits && credits.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search credit number or vendor…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vendor credits" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !credits || credits.length === 0 ? (
        <EmptyState icon={Undo2} title="No vendor credits yet" description="Returns raised against received bills will appear here." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Undo2} title="No matching credits" description={`No vendor credits found for "${search}".`} />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Link key={c.id} href={c.billId ? `/purchases/bills/${c.billId}` : "#"} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.creditNumber}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {vendorNameById.get(c.vendorId) || "Unknown vendor"}
                  {c.billId && ` · Bill ${billNumberById.get(c.billId) || "…"}`} · {fmtDate(c.date)}
                </p>
                {c.reason && <p className="truncate text-xs text-muted-foreground">{c.reason}</p>}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">-{inr(c.total)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
