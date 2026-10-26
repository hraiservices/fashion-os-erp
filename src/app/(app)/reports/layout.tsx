"use client";

import { usePathname } from "next/navigation";
import { resolveReportSection } from "@/components/app-shell/nav-config";
import { ReportsSidebar } from "@/components/reports/reports-sidebar";

/**
 * Keeps the Reports category rail on screen while viewing any individual report, not just the
 * Reports index page — previously the rail only existed on /reports itself, so opening a report
 * lost it and getting to a different category meant navigating back first.
 *
 * The index page (/reports) renders its own rail (stateful: filters its table in place without
 * a navigation, plus the mobile grouped-sections view) and is left untouched here to avoid a
 * duplicate rail — this layout only adds one for every other /reports/* route.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/reports") return <>{children}</>;

  const activeCategory = resolveReportSection(pathname) || null;

  return (
    <div className="flex lg:flex-row">
      <ReportsSidebar activeCategory={activeCategory} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
