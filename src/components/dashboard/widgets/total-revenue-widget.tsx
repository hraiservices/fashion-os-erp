"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Total Revenue" is whole-business revenue, not just stitching orders — it must include
 * product-sales invoices too, or it silently reads lower than Combined P&L (which does
 * include both) for any shop that sells finished products alongside custom stitching.
 */
export function TotalRevenueWidget() {
  const { stats, isLoading } = useDashboardStats();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();
  if (isLoading || invoicesLoading || !stats || !invoices) return <Skeleton className="h-40 w-full" />;

  const salesRev = invoices.reduce((s, i) => s + i.total, 0);
  const salesCollected = invoices.reduce((s, i) => s + i.paidTotal, 0);
  const totalRev = stats.totalRev + salesRev;
  const totalCollected = stats.totalCollected + salesCollected;
  const totalUnpaid = totalRev - totalCollected;
  const revCollectedPct = totalRev > 0 ? Math.round((totalCollected / totalRev) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Total Revenue</span>
        <Link href="/reports/combined-pl" className="flex items-center gap-1 text-xs text-primary hover:underline">
          View <ArrowRight className="size-3" />
        </Link>
      </div>
      <p className="mb-1 text-xs text-muted-foreground">All-time billed amount — stitching &amp; product sales</p>
      <p className="mb-4 text-2xl font-bold tabular-nums">{inr(totalRev)}</p>

      <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full">
          <div className="h-full rounded-l-full bg-blue-500 transition-all" style={{ width: `${revCollectedPct}%` }} />
          <div className="h-full flex-1 rounded-r-full bg-orange-500" />
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2.5 rounded-full bg-blue-500" />
          Collected&nbsp;:&nbsp;<span className="font-medium text-foreground">{inr(totalCollected)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2.5 rounded-full bg-orange-500" />
          Pending&nbsp;:&nbsp;<span className="font-medium text-foreground">{inr(totalUnpaid)}</span>
          <ChevronDown className="size-3" />
        </span>
      </div>
    </div>
  );
}
