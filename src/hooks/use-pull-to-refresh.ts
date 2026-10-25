"use client";

import { useCallback, useRef, useState } from "react";

const THRESHOLD = 64;
const MAX_PULL = 100;

/**
 * Minimal touch-only pull-to-refresh: tracks a vertical drag starting at the very top of a
 * scrollable container and fires `onRefresh` once the drag passes THRESHOLD on release. No
 * library — mobile browsers don't give a web page the native "swipe down to refresh" gesture
 * the way a native app gets for free, so this reproduces just enough of it (a progress
 * indicator while dragging, release-to-trigger) to feel familiar. Pointer/mouse devices never
 * fire touch events, so this has no effect on desktop — no separate viewport gating needed.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      const el = containerRef.current;
      // The container itself usually isn't the scrolling element (the page/window is), so its
      // own scrollTop is checked alongside the window's — covers both "wraps a scrollable div"
      // and "wraps plain content on a scrolling page" callers without the caller needing to know
      // which situation it's in.
      if (!el || el.scrollTop > 0 || window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    },
    [refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Half-rate drag (like iOS/Android's own overscroll feel) and capped so an enthusiastic
      // swipe doesn't push the indicator off-screen.
      setPull(Math.min(delta * 0.5, MAX_PULL));
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(() => {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false);
        setPull(0);
      });
    } else {
      setPull(0);
    }
  }, [pull, onRefresh]);

  return { containerRef, pull, refreshing, threshold: THRESHOLD, onTouchStart, onTouchMove, onTouchEnd };
}
