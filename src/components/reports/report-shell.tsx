import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";

/**
 * Consistent chrome for every /reports/* page. Crucially the table lives inside its own
 * `overflow-x-auto` container so a wide report never makes the whole page scroll sideways.
 * Every report gets a Print action for free — no need to wire it up per page.
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
    <div className="space-y-4 p-4 sm:p-6 print:p-0">
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

export function Td({ children, align = "left", className }: { children?: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return <td className={`px-3 py-2.5 ${align === "right" ? "text-right tabular-nums" : ""} ${className ?? ""}`}>{children}</td>;
}
