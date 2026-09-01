"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DueBadge } from "@/components/orders/stage-badge";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentModal } from "@/components/orders/payment-modal";
import type { Order } from "@/lib/types";

export function PendingPaymentsWidget() {
  const { data: user } = useCurrentUser();
  const { stats, isLoading } = useDashboardStats();
  const [payOrder, setPayOrder] = useState<Order | null>(null);

  if (isLoading || !stats) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CreditCard className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold">Pending Payments</h2>
          {stats.pendingPayments.length > 0 && (
            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              {stats.pendingPayments.length}
            </span>
          )}
        </div>
        <Link href="/reports/aging" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
          View aging
        </Link>
      </div>
      {stats.pendingPayments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
          <CreditCard className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">All payments collected</p>
          <p className="text-xs text-muted-foreground/60">No outstanding balances on any order</p>
        </div>
      ) : (
        <ul className="divide-y">
          {stats.pendingPayments.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/orders/${o.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.name}</p>
                <p className="truncate text-xs text-muted-foreground">{o.id}</p>
              </Link>
              <DueBadge order={o} />
              <span className="shrink-0 text-sm font-semibold text-orange-600 tabular-nums">{inr(o.balance)}</span>
              {user?.perms.managePayments && (
                <Button size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => setPayOrder(o)}>
                  Record Payment
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {payOrder && <PaymentModal order={payOrder} open={!!payOrder} onOpenChange={(o) => { if (!o) setPayOrder(null); }} />}
    </section>
  );
}
