"use client";

import { usePathname } from "next/navigation";
import { ReportsNavRail } from "@/components/reports/reports-nav-rail";

/**
 * Keeps one persistent Reports nav rail on screen while viewing any individual report, not just
 * the Reports index page — previously the rail only existed on /reports itself, so opening a
 * report lost it and getting to a different one meant navigating back first.
 *
 * This used to render the separate ReportsSidebar (category buttons only) here, while every
 * individual report page using ReportShell rendered its OWN full ReportsNavRail inline — two
 * different "jump to a report" navs stacked on screen at once, eating a whole extra column for
 * nothing. ReportsNavRail already does everything ReportsSidebar did and more (direct links to
 * every report, not just its category), so it's the one that stays, rendered once, here, and
 * ReportShell no longer renders its own copy (see report-shell.tsx).
 *
 * The index page (/reports) renders its own category rail + searchable table (a different,
 * stateful UI — filters in place without a navigation) and is left untouched here to avoid a
 * duplicate rail — this layout only adds one for every other /reports/* route.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/reports") return <>{children}</>;

  return (
    <div className="flex lg:flex-row">
      <div className="hidden shrink-0 lg:block lg:w-64 lg:border-r print:hidden">
        <ReportsNavRail />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
