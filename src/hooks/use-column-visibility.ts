"use client";

import { useEffect, useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  /** Columns the user shouldn't be able to hide (e.g. the row's primary identifier). */
  required?: boolean;
}

/** Show/hide table columns, persisted per browser (localStorage) — key it per list page. */
export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const allKeys = columns.map((c) => c.key);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`table-columns:${storageKey}`);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore malformed storage
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(next: Set<string>) {
    setHidden(next);
    localStorage.setItem(`table-columns:${storageKey}`, JSON.stringify(Array.from(next)));
  }

  function toggle(key: string) {
    const col = columns.find((c) => c.key === key);
    if (col?.required) return;
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(next);
  }

  function resetAll() {
    persist(new Set());
  }

  const isVisible = (key: string) => !hidden.has(key);

  return { columns, isVisible, toggle, resetAll, hiddenCount: hidden.size, loaded, allKeys };
}
