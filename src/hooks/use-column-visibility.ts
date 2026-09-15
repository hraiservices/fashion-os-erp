"use client";

import { useEffect, useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  /** Columns the user shouldn't be able to hide (e.g. the row's primary identifier). */
  required?: boolean;
}

export interface AutoHideConfig {
  /** Below this viewport width (px), `keys` default to hidden unless the user has explicitly
   *  shown/hidden them via the Columns menu — e.g. the Stitching Orders table's Garment/Tailor/
   *  Profit/Tailor Payable/Stitching Cost columns, which just don't fit a 14" laptop (~1536px)
   *  alongside every other column, but have room to spare on a wider monitor. */
  belowWidth: number;
  keys: string[];
}

/** Overrides are tri-state per column: present+true = user forced it shown, present+false = user
 *  forced it hidden, absent = follow the auto-hide default for the current viewport width. */
type ColumnOverrides = Record<string, boolean>;

function loadOverrides(storageKey: string): ColumnOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`table-columns:${storageKey}`);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // Legacy format: a plain array of explicitly-hidden column keys.
    if (Array.isArray(parsed)) return Object.fromEntries((parsed as string[]).map((k) => [k, false]));
    return parsed as ColumnOverrides;
  } catch {
    return {};
  }
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? Infinity : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/** Show/hide table columns, persisted per browser (localStorage) — key it per list page.
 *  Pass `autoHide` to also default some columns to hidden below a viewport width, e.g. a wide
 *  admin-only table that's too cramped on a 14" laptop screen but fine on a larger monitor. */
export function useColumnVisibility(storageKey: string, columns: ColumnDef[], autoHide?: AutoHideConfig) {
  const [overrides, setOverrides] = useState<ColumnOverrides>(() => loadOverrides(storageKey));
  const width = useViewportWidth();

  function persist(next: ColumnOverrides) {
    setOverrides(next);
    localStorage.setItem(`table-columns:${storageKey}`, JSON.stringify(next));
  }

  function defaultVisible(key: string): boolean {
    if (autoHide && width < autoHide.belowWidth && autoHide.keys.includes(key)) return false;
    return true;
  }

  const isVisible = (key: string) => (key in overrides ? overrides[key] : defaultVisible(key));

  function toggle(key: string) {
    const col = columns.find((c) => c.key === key);
    if (col?.required) return;
    persist({ ...overrides, [key]: !isVisible(key) });
  }

  function resetAll() {
    persist({});
  }

  const hiddenCount = columns.filter((c) => !isVisible(c.key)).length;

  return { columns, isVisible, toggle, resetAll, hiddenCount, loaded: true, allKeys: columns.map((c) => c.key) };
}
