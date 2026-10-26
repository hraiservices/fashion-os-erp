"use client";

import { useMemo } from "react";
import {
  REPORTS_GROUP,
  resolveReportSection,
  isReportAllowedForRole,
  DEFAULT_REPORT_ROLE_ACCESS,
  type ReportRoleAccess,
} from "@/components/app-shell/nav-config";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isReportEnabled } from "@/lib/entitlements";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useCurrentUser } from "@/hooks/use-current-user";

export interface ReportItem {
  href: string;
  label: string;
  category: string;
}

/**
 * Shared data/logic behind the Reports Center rail — the list of reports (filtered by
 * entitlements + role access), their categories with counts, and the shop-wide favourites set.
 * Used by both the Reports index page's own interactive rail and the persistent
 * ReportsSidebar shown on every individual report page (see reports/layout.tsx).
 */
export function useReportsNav() {
  const { data: entitlements } = useModuleEntitlements();
  const { data: user } = useCurrentUser();
  // Shop-wide (not per-browser) — anyone marking a report favourite changes it for everyone,
  // same as the rest of app_settings.
  const { data: favoriteHrefs, save: saveFavorites } = useAppSetting<string[]>("favoriteReports", []);
  const favorites = useMemo(() => new Set(favoriteHrefs || []), [favoriteHrefs]);
  const { data: reportAccess } = useAppSetting<ReportRoleAccess>("reportRoleAccess", DEFAULT_REPORT_ROLE_ACCESS);

  const allReports = useMemo<ReportItem[]>(() => {
    if (!entitlements) return [];
    return REPORTS_GROUP.children
      .filter((leaf) => !leaf.adminOnly || !!user?.perms.viewFinancialReports)
      .filter((leaf) => isReportAllowedForRole(leaf.href, user?.role ?? "tailor", reportAccess))
      .map((leaf) => ({ href: leaf.href, label: leaf.label, category: resolveReportSection(leaf.href) || "" }))
      .filter((r) => isReportEnabled(entitlements, r.href, r.category));
  }, [entitlements, user?.role, reportAccess]);

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

  function toggleFavorite(href: string) {
    const current = favoriteHrefs || [];
    const next = favorites.has(href) ? current.filter((h) => h !== href) : [...current, href];
    saveFavorites.mutate(next);
  }

  return { allReports, categories, favorites, favoriteCount, toggleFavorite };
}
