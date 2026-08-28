"use client";

import { useState } from "react";

export interface SavedView<F> {
  id: string;
  name: string;
  filters: F;
}

function loadViews<F>(fullKey: string): SavedView<F>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(fullKey);
    return raw ? (JSON.parse(raw) as SavedView<F>[]) : [];
  } catch {
    return [];
  }
}

/** Named, reusable filter presets for a list page — persisted per browser (localStorage). */
export function useSavedViews<F>(storageKey: string) {
  const fullKey = `table-views:${storageKey}`;
  const [views, setViews] = useState<SavedView<F>[]>(() => loadViews<F>(fullKey));

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
