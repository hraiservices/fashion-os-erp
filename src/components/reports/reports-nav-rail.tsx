"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Star } from "lucide-react";
import { REPORTS_GROUP, resolveReportSection } from "@/components/app-shell/nav-config";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isReportEnabled } from "@/lib/entitlements";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

interface ReportItem {
  href: string;
  label: string;
  category: string;
}

/**
 * Desktop-only report browser rendered alongside every individual report page (see
 * ReportShell) — the same category-grouped list the /reports index page shows, kept on
 * screen so switching between reports never means navigating back to the index first.
 * Deliberately independent of ReportsIndexPage's own rail (which drives that page's own
 * category-filtered table) — this one is pure navigation, every report is a direct link.
 */
export function ReportsNavRail() {
  const pathname = usePathname();
  const { data: entitlements } = useModuleEntitlements();
  const { data: user } = useCurrentUser();
  const { data: favoriteHrefs } = useAppSetting<string[]>("favoriteReports", []);
  const favorites = useMemo(() => new Set(favoriteHrefs || []), [favoriteHrefs]);

  const allReports = useMemo<ReportItem[]>(() => {
    if (!entitlements) return [];
    return REPORTS_GROUP.children
      .filter((leaf) => !leaf.adminOnly || user?.role === "admin")
      .map((leaf) => ({ href: leaf.href, label: leaf.label, category: resolveReportSection(leaf.href) || "" }))
      .filter((r) => isReportEnabled(entitlements, r.href, r.category));
  }, [entitlements, user?.role]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    allReports.forEach((r) => {
      if (!seen.has(r.category)) {
        seen.add(r.category);
        list.push(r.category);
      }
    });
    return list;
  }, [allReports]);

  const favoriteReports = allReports.filter((r) => favorites.has(r.href));

  function linkClass(href: string) {
    return cn(
      "block truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
      pathname === href ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );
  }

  return (
    <nav className="flex flex-col gap-3 p-3 text-sm">
      <Link
        href="/reports"
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          pathname === "/reports" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <LayoutGrid className="size-4 shrink-0" /> All Reports
      </Link>

      {favoriteReports.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Star className="size-3" /> Favourites
          </p>
          <div className="space-y-0.5">
            {favoriteReports.map((r) => (
              <Link key={r.href} href={r.href} className={linkClass(r.href)}>
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
          <div className="space-y-0.5">
            {allReports
              .filter((r) => r.category === cat)
              .map((r) => (
                <Link key={r.href} href={r.href} className={linkClass(r.href)}>
                  {r.label}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
