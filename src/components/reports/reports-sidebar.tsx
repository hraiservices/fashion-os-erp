"use client";

import Link from "next/link";
import { LayoutGrid, BarChart3, Scissors, ShoppingCart, Users, Package, Truck, Factory, Wallet, Star, type LucideIcon } from "lucide-react";
import { useReportsNav } from "@/hooks/use-reports-nav";
import { cn } from "@/lib/utils";

export const FAVORITES_CATEGORY = "__favorites__";

export const SECTION_ICON: Record<string, LucideIcon> = {
  Summary: BarChart3,
  "Stitching Orders": Scissors,
  Sales: ShoppingCart,
  Customers: Users,
  Inventory: Package,
  Purchases: Truck,
  Expenses: Wallet,
  Manufacturing: Factory,
};

function hrefFor(category: string | null) {
  if (category === FAVORITES_CATEGORY) return "/reports?cat=favourites";
  if (category === null) return "/reports";
  return `/reports?cat=${encodeURIComponent(category)}`;
}

/**
 * Persistent category rail for Reports (desktop only — lg:block). Rendered once by
 * reports/layout.tsx so it stays on screen while browsing any individual report, not just the
 * Reports index page itself. Every item links to /reports?cat=<category>, which the index page
 * reads to pick its starting category — clicking a category from inside a report always takes
 * you back to the filtered report list, same as clicking it from the index page would.
 */
export function ReportsSidebar({ activeCategory }: { activeCategory: string | null }) {
  const { allReports, categories, favoriteCount } = useReportsNav();

  return (
    <div className="sticky top-0 hidden max-h-screen shrink-0 overflow-y-auto lg:block lg:w-56 lg:border-r lg:p-4">
      <Link href="/reports" className="mb-3 block px-1 text-lg font-semibold tracking-tight hover:underline">
        Reports
      </Link>
      <nav className="flex flex-col gap-1">
        <Link
          href={hrefFor(FAVORITES_CATEGORY)}
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
            activeCategory === FAVORITES_CATEGORY ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Star className="size-4 shrink-0" />
          <span className="flex-1 whitespace-nowrap">Favourites</span>
          <span className="text-xs">{favoriteCount}</span>
        </Link>
        <Link
          href={hrefFor(null)}
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
            activeCategory === null ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <LayoutGrid className="size-4 shrink-0" />
          <span className="flex-1 whitespace-nowrap">All Reports</span>
          <span className="text-xs">{allReports.length}</span>
        </Link>
        {categories.map((c) => {
          const Icon = SECTION_ICON[c.label] || BarChart3;
          return (
            <Link
              key={c.label}
              href={hrefFor(c.label)}
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                activeCategory === c.label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 whitespace-nowrap">{c.label}</span>
              <span className="text-xs">{c.count}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
