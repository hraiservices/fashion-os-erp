"use client";

import { useState } from "react";

/** Row checkbox selection for a list page's bulk-actions toolbar. */
export function useRowSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === visibleIds.length && visibleIds.length > 0 ? new Set() : new Set(visibleIds)));
  }

  function clear() {
    setSelected(new Set());
  }

  const allSelected = visibleIds.length > 0 && selected.size === visibleIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  return { selected, toggle, toggleAll, clear, allSelected, someSelected, count: selected.size };
}
