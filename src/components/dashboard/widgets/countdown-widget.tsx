"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, AlertOctagon } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { isOrderOutstanding } from "@/lib/balances";
import { inr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

/** Delivery dates carry no time component — treat the deadline as end-of-day. */
function endOfDay(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(Math.abs(ms) / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

/**
 * Two live-ticking red countdowns for the shop owner's most time-sensitive numbers: the
 * nearest upcoming delivery deadline among active (not yet delivered/paid) orders, and how
 * long the oldest unpaid overdue order has been sitting overdue. Updates every minute — no
 * need for per-second precision on a days/hours/minutes display.
 */
export function CountdownWidget() {
  const { data: orders, isLoading } = useOrders();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const active = (orders || []).filter((o) => o.status !== "delivered" && o.status !== "payment" && o.deliveryDate);
  const nextDue = active.map((o) => ({ o, target: endOfDay(o.deliveryDate) })).sort((a, b) => a.target - b.target)[0];

  const overdue = (orders || []).filter((o) => isOrderOutstanding(o) && o.deliveryDate && endOfDay(o.deliveryDate) < now);
  const oldestOverdue = overdue.map((o) => ({ o, target: endOfDay(o.deliveryDate) })).sort((a, b) => a.target - b.target)[0];

  return (
    <div className="h-full rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">Live Countdown</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href={nextDue ? `/orders/${nextDue.o.id}` : "/orders"}
          className="block rounded-lg bg-muted/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlarmClock className="size-3.5" /> Next delivery due
          </div>
          {nextDue ? (
            <>
              <p className="mt-1 text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                {formatDuration(nextDue.target - now)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {nextDue.o.name} · {nextDue.o.id}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No active orders</p>
          )}
        </Link>

        <Link
          href={oldestOverdue ? `/orders/${oldestOverdue.o.id}` : "/reports/aging"}
          className="block rounded-lg bg-muted/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertOctagon className="size-3.5" /> Oldest overdue payment
          </div>
          {oldestOverdue ? (
            <>
              <p className="mt-1 text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                {formatDuration(now - oldestOverdue.target)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {oldestOverdue.o.name} · {inr(oldestOverdue.o.balance)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No overdue payments</p>
          )}
        </Link>
      </div>
    </div>
  );
}
