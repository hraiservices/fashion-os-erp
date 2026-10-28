"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Rendered cell content. */
  render: (row: T) => React.ReactNode;
  /** A comparable value used for sorting; omit for a column that can't be sorted. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Columns the user can't hide via the column picker (e.g. the primary identifier). */
  alwaysVisible?: boolean;
  className?: string;
}

/**
 * Zoho-style records table: sortable column headers, a column-visibility picker, and optional
 * row selection — generalized so Bills and Vendors (and future list pages) share one
 * implementation instead of each hand-rolling its own table or card list.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  getHref,
  selectedIds,
  onToggleRow,
  onToggleAll,
  storageKey,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getHref?: (row: T) => string;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
  /** Persists which columns are hidden across visits, scoped per table (e.g. "bills-table"). */
  storageKey?: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (!storageKey || typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(`data-table:${storageKey}`);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(`data-table:${storageKey}`, JSON.stringify([...next]));
        } catch {
          // best-effort only
        }
      }
      return next;
    });
  }

  function handleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  const visibleColumns = columns.filter((c) => c.alwaysVisible || !hidden.has(c.key));

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
  }, [rows, sortKey, sortDir, columns]);

  const allSelected = !!selectedIds && rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              {onToggleRow && (
                <th className="w-10 p-2.5">
                  <Checkbox checked={allSelected} onChange={() => onToggleAll?.()} aria-label="Select all" />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={cn("p-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground", col.align === "right" ? "text-right" : "text-left")}
                >
                  {col.sortValue ? (
                    <button type="button" onClick={() => handleSort(col)} className={cn("inline-flex items-center gap-1 hover:text-foreground", col.align === "right" && "flex-row-reverse")}>
                      {col.header}
                      {sortKey === col.key ? sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              <th className="w-10 p-2.5 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" aria-label="Choose columns" />}>
                    <SlidersHorizontal className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {columns.filter((c) => !c.alwaysVisible).map((col) => (
                      <DropdownMenuCheckboxItem key={col.key} checked={!hidden.has(col.key)} onCheckedChange={() => toggleColumn(col.key)}>
                        {col.header}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedRows.map((row) => {
              const href = getHref?.(row);
              const Row = (
                <>
                  {onToggleRow && (
                    <td className="p-2.5" onClick={(e) => e.preventDefault()}>
                      <Checkbox checked={!!selectedIds?.has(row.id)} onChange={() => onToggleRow(row.id)} aria-label="Select row" />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={cn("p-2.5", col.align === "right" ? "text-right tabular-nums" : "text-left", col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                  <td />
                </>
              );
              return href ? (
                <tr key={row.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(href)}>
                  {Row}
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-muted/40">
                  {Row}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
