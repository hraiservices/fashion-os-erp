"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, LayoutGrid, BarChart3, Scissors, ShoppingCart, Users, Package, Truck, Factory, Wallet, Star, type LucideIcon } from "lucide-react";
import { REPORTS_GROUP, resolveReportSection } from "@/components/app-shell/nav-config";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isReportEnabled } from "@/lib/entitlements";
import { useAppSetting } from "@/hooks/use-app-setting";
import { cn } from "@/lib/utils";

const FAVORITES_CATEGORY = "__favorites__";

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
  const { data: entitlements } = useModuleEntitlements();
  // Shop-wide (not per-browser) — anyone marking a report favourite changes it for everyone,
  // same as the rest of app_settings.
  const { data: favoriteHrefs, save: saveFavorites } = useAppSetting<string[]>("favoriteReports", []);
  const favorites = useMemo(() => new Set(favoriteHrefs || []), [favoriteHrefs]);

  const allReports = useMemo<ReportItem[]>(() => {
    if (!entitlements) return [];
    return REPORTS_GROUP.children
      .map((leaf) => ({ href: leaf.href, label: leaf.label, category: resolveReportSection(leaf.href) || "" }))
      .filter((r) => isReportEnabled(entitlements, r.href, r.category));
  }, [entitlements]);

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

  const favoriteCount = useMemo(() => allReports.filter((r) => favorites.has(r.href)).length, [allReports, favorites]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (activeCategory === FAVORITES_CATEGORY) return allReports.filter((r) => favorites.has(r.href));
    return allReports.filter((r) => !activeCategory || r.category === activeCategory);
  }, [allReports, activeCategory, favorites]);

  function toggleFavorite(href: string) {
    const current = favoriteHrefs || [];
    const next = favorites.has(href) ? current.filter((h) => h !== href) : [...current, href];
    saveFavorites.mutate(next);
  }

  // Grouped-by-category list for the report rows within one category card, shared by both the
  // mobile grouped-sections view and (implicitly) mirrors the desktop table's row content.
  function reportsFor(category: string) {
    return allReports.filter((r) => r.category === category);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Mobile: grouped category sections instead of a horizontally-scrolling tab rail — every
          report is visible at once, stacked into one card per category, matching the native
          "Reports" screen pattern (plain rows + chevron, grouped into rounded sections) rather
          than a web-style filterable table. Desktop keeps the rail+table layout below. */}
      <div className="flex-1 space-y-4 p-4 lg:hidden">
        <h1 className="px-1 text-lg font-semibold tracking-tight">Reports</h1>

        {/* Always shown first, even empty — Favourites is the whole point of a "pin what I use
            most" feature, so it shouldn't disappear until you've actually pinned something. */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Star className="size-3.5" /> Favourites
          </div>
          {favoriteCount > 0 ? (
            <div className="divide-y">
              {allReports
                .filter((r) => favorites.has(r.href))
                .map((r) => (
                  <div key={r.href} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(r.href)}
                      aria-label={`Remove ${r.label} from favourites`}
                      aria-pressed
                      className="p-3 text-muted-foreground hover:text-amber-500"
                    >
                      <Star className="size-4 fill-amber-400 text-amber-500" />
                    </button>
                    <Link href={r.href} className="flex flex-1 items-center justify-between gap-2 py-3 pr-4 text-primary">
                      <span className="font-medium">{r.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </div>
                ))}
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-muted-foreground">Tap the star next to any report below to pin it here.</p>
          )}
        </div>

        {categories.map((c) => (
          <div key={c.label} className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="divide-y">
              {reportsFor(c.label).map((r) => (
                <div key={r.href} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(r.href)}
                    aria-label={favorites.has(r.href) ? `Remove ${r.label} from favourites` : `Add ${r.label} to favourites`}
                    aria-pressed={favorites.has(r.href)}
                    className="p-3 text-muted-foreground hover:text-amber-500"
                  >
                    <Star className={cn("size-4", favorites.has(r.href) && "fill-amber-400 text-amber-500")} />
                  </button>
                  <Link href={r.href} className="flex flex-1 items-center justify-between gap-2 py-3 pr-4 text-primary">
                    <span className="font-medium">{r.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: category rail */}
      <div className="hidden shrink-0 lg:block lg:w-56 lg:border-r lg:p-4">
        <h1 className="mb-3 px-1 text-lg font-semibold tracking-tight">Reports</h1>
        <nav className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setActiveCategory(FAVORITES_CATEGORY)}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
              activeCategory === FAVORITES_CATEGORY ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Star className="size-4 shrink-0" />
            <span className="flex-1 whitespace-nowrap">Favourites</span>
            <span className="text-xs">{favoriteCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
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
                  "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
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

      {/* Desktop: report table */}
      <div className="hidden min-w-0 flex-1 space-y-4 p-4 lg:block sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {activeCategory === FAVORITES_CATEGORY ? "Favourites" : activeCategory || "All Reports"}{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span>
          </h2>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-4 py-2.5 font-medium">Report Name</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Category</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.href} className="group">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(r.href)}
                        aria-label={favorites.has(r.href) ? `Remove ${r.label} from favourites` : `Add ${r.label} to favourites`}
                        aria-pressed={favorites.has(r.href)}
                        className="text-muted-foreground hover:text-amber-500"
                      >
                        <Star className={cn("size-4", favorites.has(r.href) && "fill-amber-400 text-amber-500")} />
                      </button>
                    </td>
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
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {activeCategory === FAVORITES_CATEGORY
                ? "No favourites yet — click the star next to any report to add it here."
                : "No reports in this category."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
