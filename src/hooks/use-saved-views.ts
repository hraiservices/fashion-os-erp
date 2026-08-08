"use client";

import { useEffect, useState } from "react";

export interface SavedView<F> {
  id: string;
  name: string;
  filters: F;
}

/** Named, reusable filter presets for a list page — persisted per browser (localStorage). */
export function useSavedViews<F>(storageKey: string) {
  const [views, setViews] = useState<SavedView<F>[]>([]);
  const fullKey = `table-views:${storageKey}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) setViews(JSON.parse(raw) as SavedView<F>[]);
    } catch {
      // ignore malformed storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(next: SavedView<F>[]) {
    setViews(next);
    localStorage.setItem(fullKey, JSON.stringify(next));
  }

  function save(name: string, filters: F) {
    const view: SavedView<F> = { id: `view-${Date.now()}`, name, filters };
    persist([...views, view]);
    return view;
  }

  function remove(id: string) {
    persist(views.filter((v) => v.id !== id));
  }

  return { views, save, remove };
}
