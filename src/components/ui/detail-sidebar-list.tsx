"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SidebarListItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Already-formatted (e.g. "₹1,200 due", "₹500") — left blank to show nothing. */
  amountLabel?: string;
  /** "due" renders red (something owed); "plain" renders muted (a neutral figure, e.g. an expense amount). */
  amountTone?: "due" | "plain";
  href: string;
}

/**
 * Zoho-style "all records" rail next to a record's own detail page, so moving between records
 * doesn't mean going back to the list each time — same pattern as the CRM customer sidebar
 * (src/components/crm/customer-sidebar-list.tsx), generalized for other sections (Invoices,
 * Orders, Vendors, Employees, Expenses). Desktop/tablet only (lg+); there's no room for a
 * sidebar beside a full detail view on a phone, so this renders nothing below that breakpoint.
 */
export function DetailSidebarList({ items, activeId, searchPlaceholder = "Search…", emptyLabel = "No records yet" }: { items: SidebarListItem[]; activeId: string; searchPlaceholder?: string; emptyLabel?: string }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((i) => i.title.toLowerCase().includes(query) || (i.subtitle || "").toLowerCase().includes(query));
  }, [items, q]);

  return (
    <aside className="hidden w-72 shrink-0 self-start lg:block">
      <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col rounded-xl border bg-card">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-9 pl-8 text-sm" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-4 text-center text-xs text-muted-foreground">{q ? `No matches for "${q}"` : emptyLabel}</li>
          ) : (
            filtered.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={cn("block px-3 py-2.5 transition-colors hover:bg-muted/50", active && "bg-primary/5 hover:bg-primary/5")}
                    aria-current={active ? "page" : undefined}
                  >
                    <p className={cn("truncate text-sm font-medium", active && "text-primary")}>{item.title}</p>
                    {item.amountLabel && (
                      <p className={cn("mt-0.5 text-xs tabular-nums", item.amountTone === "due" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{item.amountLabel}</p>
                    )}
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
