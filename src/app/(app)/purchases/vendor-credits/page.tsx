"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Undo2, ChevronRight } from "lucide-react";
import { useVendorCredits } from "@/hooks/use-vendor-credits";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function VendorCreditsPage() {
  const { data: credits, isLoading } = useVendorCredits();
  const { data: vendors } = useVendors();
  const { data: bills } = usePurchaseBills();

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const billNumberById = useMemo(() => new Map((bills || []).map((b) => [b.id, b.billNumber])), [bills]);
  const totalCredited = useMemo(() => (credits || []).reduce((s, c) => s + c.total, 0), [credits]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Vendor Credits" description={`${credits?.length ?? 0} credits · ${inr(totalCredited)} total returned`} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !credits || credits.length === 0 ? (
        <EmptyState icon={Undo2} title="No vendor credits yet" description="Returns raised against received bills will appear here." />
      ) : (
        <div className="space-y-2">
          {credits.map((c) => (
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
