"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClock, Wallet } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { isOrderOutstanding } from "@/lib/balances";
import { inr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order } from "@/lib/types";

/** Delivery dates carry no time component — treat the deadline as end-of-day, so a live
 * second-level countdown has a real millisecond target instead of just a calendar-day diff. */
function endOfDay(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** One row per distinct customer (by mobile) — keeps the "next 10" list from being crowded
 * out by a single repeat customer with several orders. Each customer's most urgent (soonest
 * or most overdue) qualifying order represents them. */
function topCustomersByDeadline(orders: Order[], predicate: (o: Order) => boolean, limit: number): { order: Order; target: number }[] {
  const byCustomer = new Map<string, { order: Order; target: number }>();
  for (const o of orders) {
    if (!o.deliveryDate || !predicate(o)) continue;
    const key = o.mobile || o.id;
    const target = endOfDay(o.deliveryDate);
    const existing = byCustomer.get(key);
    if (!existing || target < existing.target) byCustomer.set(key, { order: o, target });
  }
  return [...byCustomer.values()].sort((a, b) => a.target - b.target).slice(0, limit);
}

function formatCountdown(ms: number): { text: string; overdue: boolean } {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { text: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, overdue };
}

function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function CountdownRow({ order, target, now, amount }: { order: Order; target: number; now: number; amount?: number }) {
  const { text, overdue } = formatCountdown(target - now);
  return (
    <li>
      <Link href={`/orders/${order.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{order.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.id}
            {amount !== undefined && <> · {inr(amount)}</>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
            {overdue && "−"}
            {text}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-red-600/70 dark:text-red-400/70">
            {overdue ? "overdue" : "remaining"}
          </p>
        </div>
      </Link>
    </li>
  );
}

/** Next 10 customers by soonest (or most overdue) delivery deadline, among orders still in the
 * active pipeline — i.e. customers currently waiting on a stitching order. */
export function UpcomingDeliveriesWidget() {
  const { data: orders, isLoading } = useOrders();
  const now = useTicker();

  const rows = useMemo(
    () => topCustomersByDeadline(orders || [], (o) => o.status !== "delivered" && o.status !== "payment", 10),
    [orders]
  );

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <AlarmClock className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Delivery Countdown</h2>
          {rows.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {rows.length}
            </span>
          )}
        </div>
        <Link href="/orders?view=board" className="text-xs text-muted-foreground hover:text-foreground">
          View board
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={AlarmClock} title="No active orders" description="Nothing currently in the delivery pipeline." className="border-0" />
      ) : (
        <ul className="divide-y">
          {rows.map(({ order, target }) => (
            <CountdownRow key={order.id} order={order} target={target} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Next 10 customers by soonest (or most overdue) payment deadline, among orders that still
 * carry a balance — reuses the same delivery-date deadline the rest of the app treats as the
 * payment-pressure reference point (see dueBadge() / DueBadge), scoped to unpaid orders only. */
export function UpcomingPaymentsWidget() {
  const { data: orders, isLoading } = useOrders();
  const now = useTicker();

  const rows = useMemo(() => topCustomersByDeadline(orders || [], isOrderOutstanding, 10), [orders]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Payment Countdown</h2>
          {rows.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {rows.length}
            </span>
          )}
        </div>
        <Link href="/reports/aging" className="text-xs text-muted-foreground hover:text-foreground">
          View aging
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="All payments collected" description="No outstanding balances on any order." className="border-0" />
      ) : (
        <ul className="divide-y">
          {rows.map(({ order, target }) => (
            <CountdownRow key={order.id} order={order} target={target} now={now} amount={order.balance} />
          ))}
        </ul>
      )}
    </section>
  );
}
