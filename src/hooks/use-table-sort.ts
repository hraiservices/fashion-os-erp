"use client";

import { useState } from "react";

interface SortState {
  key: string;
  asc: boolean;
}

function loadSort(storageKey: string): SortState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`table-sort:${storageKey}`);
    return raw ? (JSON.parse(raw) as SortState) : null;
  } catch {
    return null;
  }
}

/**
 * Column-header click-to-sort for report tables, persisted per report (localStorage) — same
 * `storageKey`-per-page pattern as useColumnVisibility, so each report remembers its own last
 * sort across visits instead of resetting (Orders List's click-to-sort, by contrast, intentionally
 * resets every page load — reports are read repeatedly over time and benefit from staying put).
 *
 * Pass one comparator per sortable column key. `defaultDescKeys` names the columns (usually
 * amounts/counts) that should sort highest-first on their first click — matching Orders List's
 * TEXT_SORT_COLUMNS convention: text columns default ascending (A→Z), numeric columns default
 * descending (largest first), since that's the direction you almost always want on the first click.
 */
export function useTableSort<T>(
  storageKey: string,
  comparators: Record<string, (a: T, b: T) => number>,
  defaultDescKeys?: Set<string>
) {
  const [sort, setSort] = useState<SortState | null>(() => loadSort(storageKey));

  function toggleSort(key: string) {
    setSort((prev) => {
      const next = prev?.key === key ? { key, asc: !prev.asc } : { key, asc: !defaultDescKeys?.has(key) };
      try {
        localStorage.setItem(`table-sort:${storageKey}`, JSON.stringify(next));
      } catch {
        // Storage can throw (private browsing, quota) — sorting still works for this session.
      }
      return next;
    });
  }

  function applySort(rows: T[]): T[] {
    if (!sort || !comparators[sort.key]) return rows;
    const sorted = [...rows].sort(comparators[sort.key]);
    return sort.asc ? sorted : sorted.reverse();
  }

  return { sortKey: sort?.key ?? null, sortAsc: sort?.asc ?? true, toggleSort, applySort };
}
