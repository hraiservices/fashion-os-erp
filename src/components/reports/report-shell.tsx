import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { ReportsNavRail } from "@/components/reports/reports-nav-rail";

/**
 * Consistent chrome for every /reports/* page. Crucially the table lives inside its own
 * `overflow-x-auto` container so a wide report never makes the whole page scroll sideways.
 * Every report gets a Print action for free — no need to wire it up per page.
 *
 * Desktop keeps the full report list (ReportsNavRail) visible alongside every individual
 * report, so switching between reports never means navigating back to /reports first — the
 * back link below is mobile-only, where there's no room for a persistent list.
 */
export function ReportShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex lg:items-start">
      <div className="hidden shrink-0 lg:block lg:w-64 lg:border-r print:hidden">
        <ReportsNavRail />
      </div>
      <div className="min-w-0 flex-1 space-y-4 p-4 sm:p-6 print:p-0">
        {/* Mobile only — desktop has the persistent Reports rail to its left instead. */}
        <Link href="/reports" className="inline-flex items-center gap-0.5 text-sm text-primary lg:hidden print:hidden">
          <ChevronLeft className="size-5" /> Reports
        </Link>
        <PageHeader
          title={title}
          description={description}
          actions={
            <>
              {actions}
              <PrintButton size="sm" />
            </>
          }
        />
        {children}
      </div>
    </div>
  );
}

export function ReportCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-xl border bg-card ${className ?? ""}`}>{children}</div>;
}

/**
 * Table wrapper: horizontal scroll is contained here, never on <body>. Most /reports/* pages
 * have 4+ columns, which forces horizontal scroll on a phone — `report-table-pinned` (see
 * globals.css) keeps the first column (the row's name/date/identity) visible while scrolling
 * the rest, below the `sm` breakpoint only, so you never lose track of which row you're
 * looking at. `scrollbar-hide` removes the visible scroll track; the row stays scrollable.
 */
export function ReportTable({ children }: { children: React.ReactNode }) {
  return (
    <ReportCard>
      <div className="scrollbar-hide overflow-x-auto">
        <table className="report-table-pinned w-full text-sm">{children}</table>
      </div>
    </ReportCard>
  );
}

export function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className, colSpan }: { children?: React.ReactNode; align?: "left" | "right"; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 ${align === "right" ? "text-right tabular-nums" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}

/** The "Total" row every report table needs — rendered as the FIRST row of `<tbody>`, right
 *  under the header, not tucked away at the bottom where it's easy to miss on a long table.
 *  Use plain `<Td>` cells inside (first one usually just says "Total"). */
export function ReportTotalsRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b-2 bg-muted/40 font-semibold">{children}</tr>;
}
