"use client";

import { useEffect, useRef, useState } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { inr } from "@/lib/format";

/** Shared building blocks for the dashboard's "live chart" cards (Profit Overview, Pipeline
 *  Velocity, Tailor Performance, ...) — the count-up number animation, the small legend dot,
 *  the labeled stat tile, and the live-polling effect every one of them uses the same way. */

/** Animates a number counting from its previous value to the new one whenever it changes — a
 *  live-refreshed total would otherwise just snap, which reads as a flicker rather than
 *  something updating in front of you. */
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}

/** Re-invalidates the given query keys on an interval for as long as the calling widget is
 *  mounted — the "LIVE" behavior. Scoped to just that widget's mount rather than a global
 *  polling interval: the shared 30s staleTime + refetch-on-focus/mount (app/providers.tsx)
 *  already covers every other screen; this just adds "keeps ticking while you're looking at it". */
export function useLiveRefresh(qc: QueryClient, queryKeys: QueryKey[], intervalMs = 30_000) {
  useEffect(() => {
    const id = setInterval(() => {
      for (const key of queryKeys) qc.invalidateQueries({ queryKey: key });
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKeys is a fresh array/objects each render; callers pass a stable-enough literal and we only want this to (re)bind on qc/intervalMs.
  }, [qc, intervalMs]);
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function MoneyStat({ label, value, color }: { label: string; value: number; color: string }) {
  const animated = useCountUp(value);
  return (
    <div className="min-w-[6rem]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums" style={{ color }}>{inr(animated)}</p>
    </div>
  );
}

export function NumberStat({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color?: string }) {
  const animated = useCountUp(value);
  return (
    <div className="min-w-[6rem]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums" style={color ? { color } : undefined}>
        {animated}
        {suffix}
      </p>
    </div>
  );
}
