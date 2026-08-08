"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, LayoutGrid, BarChart3, Scissors, ShoppingCart, Users, Package, Truck, Factory, Wallet, type LucideIcon } from "lucide-react";
import { REPORTS_GROUP } from "@/components/app-shell/nav-config";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SECTION_ICON: Record<string, LucideIcon> = {
  Summary: BarChart3,
  "Stitching Orders": Scissors,
  Sales: ShoppingCart,
  Customers: Users,
  Inventory: Package,
  Purchases: Truck,
  Expenses: Wallet,
  Manufacturing: Factory,
};

interface ReportItem {
  href: string;
  label: string;
  category: string;
}

/**
 * Reports Center — a category rail on the left, one searchable table on the right, instead
 * of a grid of collapsible cards. Both the category list and every report row still derive
 * straight from REPORTS_GROUP in nav-config.ts, so this page can never drift out of sync
 * with the sidebar submenu.
 */
export default function ReportsIndexPage() {
  const allReports = useMemo<ReportItem[]>(() => {
    let category = "";
    return REPORTS_GROUP.children.map((leaf) => {
      if (leaf.section) category = leaf.section;
      return { href: leaf.href, label: leaf.label, category };
    });
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: { label: string; count: number }[] = [];
    allReports.forEach((r) => {
      if (seen.has(r.category)) {
        list.find((c) => c.label === r.category)!.count += 1;
      } else {
        seen.add(r.category);
        list.push({ label: r.category, count: 1 });
      }
    });
    return list;
  }, [allReports]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReports.filter((r) => (!activeCategory || r.category === activeCategory) && (!q || r.label.toLowerCase().includes(q)));
  }, [allReports, activeCategory, search]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Category rail */}
      <div className="shrink-0 border-b p-3 lg:w-56 lg:border-b-0 lg:border-r lg:p-4">
        <h1 className="mb-3 px-1 text-lg font-semibold tracking-tight">Reports</h1>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors lg:w-full",
              activeCategory === null ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <LayoutGrid className="size-4 shrink-0" />
            <span className="flex-1 whitespace-nowrap">All Reports</span>
            <span className="text-xs">{allReports.length}</span>
          </button>
          {categories.map((c) => {
            const Icon = SECTION_ICON[c.label] || BarChart3;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => setActiveCategory(c.label)}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors lg:w-full",
                  activeCategory === c.label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 whitespace-nowrap">{c.label}</span>
                <span className="text-xs">{c.count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Report table */}
      <div className="min-w-0 flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {activeCategory || "All Reports"} <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span>
          </h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search reports…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Report Name</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Category</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.href} className="group">
                    <td className="p-0">
                      <Link href={r.href} className="block px-4 py-3 font-medium text-primary group-hover:underline sm:py-2.5">
                        {r.label}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">{r.category}</span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{r.category}</td>
                    <td className="px-4 py-2.5">
                      <Link href={r.href} aria-label={`Open ${r.label}`}>
                        <ChevronRight className="size-4 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No reports match &quot;{search}&quot;.</div>}
        </div>
      </div>
    </div>
  );
}
