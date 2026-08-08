"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function OutstandingBalanceWidget() {
  const { stats, isLoading: l1 } = useDashboardStats();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  if (l1 || l2 || !stats) return <Skeleton className="h-40 w-full" />;

  // Sales invoices don't have an "overdue" concept of their own here, so their unpaid
  // balance is folded into "current" — only stitching orders' own aging feeds "overdue".
  const salesDues = (invoices || []).reduce((s, i) => s + i.balance, 0);
  const overdueBalance = stats.overdueBalance;
  const currentBalance = stats.currentBalance + salesDues;
  const totalPending = overdueBalance + currentBalance;

  const outstandingCurrentPct = totalPending > 0 ? Math.round((currentBalance / totalPending) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Outstanding Balance</span>
        <Link href="/reports/customer-balances" className="flex items-center gap-1 text-xs text-primary hover:underline">
          View <ArrowRight className="size-3" />
        </Link>
      </div>
      <p className="mb-1 text-xs text-muted-foreground">Total unpaid across stitching orders &amp; sales invoices</p>
      <p className="mb-4 text-2xl font-bold tabular-nums">{inr(totalPending)}</p>

      <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full">
          <div className="h-full rounded-l-full bg-blue-500 transition-all" style={{ width: `${outstandingCurrentPct}%` }} />
          <div className="h-full flex-1 rounded-r-full bg-orange-500" />
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2.5 rounded-full bg-blue-500" />
          Current&nbsp;:&nbsp;<span className="font-medium text-foreground">{inr(currentBalance)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2.5 rounded-full bg-orange-500" />
          Overdue&nbsp;:&nbsp;<span className="font-medium text-foreground">{inr(overdueBalance)}</span>
          <ChevronDown className="size-3" />
        </span>
      </div>
    </div>
  );
}
