"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";
import { sumOrdersOutstanding, sumInvoicesOutstanding } from "@/lib/balances";
import type { CustomerProfile } from "@/lib/crm";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

/**
 * Zoho-style "all customers" rail alongside a customer's own detail page, so switching between
 * customers doesn't mean going back to the list each time. Desktop/tablet only (lg+) — there's no
 * room for a sidebar next to a full detail view on a phone, so this renders nothing below that
 * breakpoint; the detail page itself is unaffected and still reachable from the list there.
 *
 * `profiles` is expected already sorted the way the main Customers list defaults to (most recent
 * order first — see buildCustomerMap()), so this only filters for search, it never re-sorts.
 */
export function CustomerSidebarList({ profiles, invoices, activeMobile }: { profiles: CustomerProfile[]; invoices: SalesInvoiceWithBalance[] | undefined; activeMobile: string }) {
  const [q, setQ] = useState("");

  const invoicesByMobile = useMemo(() => {
    const map = new Map<string, SalesInvoiceWithBalance[]>();
    for (const inv of invoices || []) {
      const list = map.get(inv.customerMobile);
      if (list) list.push(inv);
      else map.set(inv.customerMobile, [inv]);
    }
    return map;
  }, [invoices]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return profiles;
    return profiles.filter((c) => c.name.toLowerCase().includes(query) || c.mobile.includes(query));
  }, [profiles, q]);

  return (
    <aside className="hidden w-72 shrink-0 self-start lg:block">
      <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col rounded-xl border bg-card">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="h-9 pl-8 text-sm" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-4 text-center text-xs text-muted-foreground">No customers match &quot;{q}&quot;</li>
          ) : (
            filtered.map((c) => {
              const due = sumOrdersOutstanding(c.orders) + sumInvoicesOutstanding(invoicesByMobile.get(c.mobile) || []);
              const active = c.mobile === activeMobile;
              return (
                <li key={c.mobile}>
                  <Link
                    href={`/crm/${c.mobile}`}
                    className={cn("block px-3 py-2.5 transition-colors hover:bg-muted/50", active && "bg-primary/5 hover:bg-primary/5")}
                    aria-current={active ? "page" : undefined}
                  >
                    <p className={cn("truncate text-sm font-medium", active && "text-primary")}>{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.mobile}</p>
                    <p className={cn("mt-0.5 text-xs font-semibold tabular-nums", due > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {due > 0 ? `${inr(due)} due` : "No dues"}
                    </p>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </aside>
  );
}
