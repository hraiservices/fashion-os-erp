import Link from "next/link";
import { CalendarClock, AlertTriangle, Inbox, Scissors, Shirt, Sparkles, PackageCheck, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getOrderStatusCounts } from "@/lib/analytics";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CardDef {
  key: keyof ReturnType<typeof getOrderStatusCounts>;
  label: string;
  icon: LucideIcon;
  href: string;
  border: string;
  iconClass: string;
}

const CARDS: CardDef[] = [
  { key: "dueToday", label: "Due Today", icon: CalendarClock, href: "/reports/today-deliverables", border: "border-l-amber-400", iconClass: "text-amber-500" },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, href: "/reports/overdue", border: "border-l-red-500", iconClass: "text-red-500" },
  { key: "received", label: "Received", icon: Inbox, href: "/orders?stage=received", border: "border-l-slate-400", iconClass: "text-slate-500" },
  { key: "cutting", label: "Cutting", icon: Scissors, href: "/orders?stage=cutting", border: "border-l-indigo-400", iconClass: "text-indigo-500" },
  { key: "stitching", label: "Stitching", icon: Shirt, href: "/orders?stage=stitching", border: "border-l-blue-400", iconClass: "text-blue-500" },
  { key: "finishing", label: "Finishing", icon: Sparkles, href: "/orders?stage=finishing", border: "border-l-purple-400", iconClass: "text-purple-500" },
  { key: "ready", label: "Ready", icon: PackageCheck, href: "/orders?stage=ready", border: "border-l-emerald-500", iconClass: "text-emerald-600" },
  { key: "delivered", label: "Delivered", icon: Truck, href: "/orders?stage=delivered", border: "border-l-neutral-800 dark:border-l-neutral-300", iconClass: "text-neutral-700 dark:text-neutral-300" },
];

/** Small clickable at-a-glance counts for the order pipeline — Due Today/Overdue mirror the
 *  same definitions as their dedicated reports, the rest are a live snapshot of the whole
 *  pipeline (see getOrderStatusCounts()). Each card is a plain Link to the filtered view it
 *  describes rather than an inline preview, so there's exactly one place ("the real list") that
 *  ever needs to agree with what got counted here. */
export function OrderStatusCards({ orders }: { orders: Order[] }) {
  const counts = getOrderStatusCounts(orders);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {CARDS.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className={cn(
            "rounded-xl border border-l-4 bg-card p-3 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            c.border
          )}
        >
          <p className="text-2xl font-bold tabular-nums tracking-tight">{counts[c.key]}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <c.icon className={cn("size-3.5 shrink-0", c.iconClass)} />
            <span className="truncate">{c.label}</span>
          </p>
        </Link>
      ))}
    </div>
  );
}
