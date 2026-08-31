"use client";

import { useSyncExternalStore } from "react";

/** SSR-safe media query hook — server snapshot is always `false` so hydration never mismatches. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
