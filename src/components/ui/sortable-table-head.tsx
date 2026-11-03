"use client";

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A clickable, sort-indicating `<TableHead>` for the plain shadcn `<Table>` list pages (Products,
 * Raw Materials, Invoices, …) — the report pages already have this via `Th` in report-shell.tsx,
 * but that component is styled for `ReportTable`'s own header, not the shadcn Table these pages
 * use. Pairs with `useTableSort` the same way `Th` does: pass its `sortKey`/`currentSort`/`onSort`
 * straight through.
 */
export function SortableTableHead({
  children,
  sortKey,
  currentSort,
  onSort,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  sortKey: string;
  currentSort: { key: string | null; asc: boolean };
  onSort: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = currentSort.key === sortKey;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse")}
      >
        {children}
        {active ? (
          currentSort.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
