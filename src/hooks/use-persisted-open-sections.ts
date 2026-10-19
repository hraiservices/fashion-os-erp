"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which named sections of a long, accordion-style page are open — e.g. the Day Book's
 * "Cash & Payments" / "Operations" / "Charts & Staff" / "Transaction Log" groups — persisted
 * per browser (localStorage) and keyed per page, so each person's accordion stays the way they
 * left it.
 *
 * `defaultOpen` MUST be a stable reference (a module-level constant, never an inline array
 * literal built fresh on every render) for two reasons:
 *  - It is what the server, and the client's very first render before hydration, both show.
 *    Reading localStorage synchronously during render would make those two disagree and cost
 *    the page its server HTML — the same reasoning as useHydrated, just for a value instead of
 *    a boolean. useSyncExternalStore's getServerSnapshot covers that split without an effect.
 *  - useSyncExternalStore compares snapshots by reference (Object.is), not deep equality, to
 *    decide whether anything changed. A fresh array every render always "changes", which is
 *    exactly the failure mode the per-key cache below avoids for the PERSISTED value too: once
 *    read, the same array reference is handed back on every later render until `setOpen`
 *    actually replaces it.
 */

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, string[]>();

const prefix = (key: string) => `open-sections:${key}`;

function parse(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function readAndCache(storageKey: string, defaultOpen: string[]): string[] {
  const sk = prefix(storageKey);
  if (!cache.has(sk)) cache.set(sk, parse(localStorage.getItem(sk)) ?? defaultOpen);
  return cache.get(sk)!;
}

export function usePersistedOpenSections(storageKey: string, defaultOpen: string[]) {
  const sk = prefix(storageKey);

  const subscribe = useCallback(
    (onStoreChange: Listener) => {
      let set = listeners.get(sk);
      if (!set) listeners.set(sk, (set = new Set()));
      set.add(onStoreChange);
      return () => set.delete(onStoreChange);
    },
    [sk]
  );

  const open = useSyncExternalStore(
    subscribe,
    () => readAndCache(storageKey, defaultOpen),
    () => defaultOpen
  );

  const setOpen = useCallback(
    (next: string[]) => {
      cache.set(sk, next);
      try {
        localStorage.setItem(sk, JSON.stringify(next));
      } catch {
        // Private browsing / storage full — the toggle still works for this page view, it just
        // won't be remembered next time.
      }
      listeners.get(sk)?.forEach((l) => l());
    },
    [sk]
  );

  return [open, setOpen] as const;
}
