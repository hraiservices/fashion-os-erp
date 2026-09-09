"use client";

import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";

/**
 * Full-screen "signing you in" screen shown between a successful login and the dashboard
 * actually landing — covers the gap where router.push() has fired but Next hasn't finished
 * loading the /dashboard route + its data yet, which otherwise reads as the page silently
 * hanging (the submit button's own spinner turns off the instant auth succeeds, well before
 * the dashboard is actually ready).
 *
 * The percentage is a smooth animated climb, not tied to real request/route-load progress —
 * deliberately: chaining it to actual steps (auth verified → role loaded → dashboard data
 * fetched) risks looking stuck at 90% if any one step is slow, and the real timeline varies too
 * much between mobile+PIN and email login to represent honestly as discrete steps anyway. This
 * animates to ~92% over ~1.4s, then the caller flips `done` once it's ready to navigate, which
 * snaps the rest of the way to 100% quickly before router.push() actually fires.
 */
export function SignInProgressOverlay({ shopName, logoDataUrl, done }: { shopName?: string; logoDataUrl?: string | null; done: boolean }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (done) return;
    let raf: number;
    const start = performance.now();
    const DURATION_MS = 1400;
    const CAP = 92;
    function tick(now: number) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setPct(Math.round(eased * CAP));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  useEffect(() => {
    if (!done) return;
    let raf: number;
    const start = performance.now();
    const from = pct;
    const DURATION_MS = 280;
    function tick(now: number) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setPct(Math.round(from + (100 - from) * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs on `done`, animating from whatever `pct` was at that moment
  }, [done]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950"
    >
      <div className="relative flex size-16 items-center justify-center">
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary/40 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-black/5 bg-white shadow-lg shadow-zinc-900/10 dark:border-white/10">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt={shopName || "Company logo"} className="size-full rounded-2xl object-contain p-1.5" />
          ) : (
            <Scissors className="size-7 text-primary" />
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="tabular-nums text-4xl font-semibold tracking-tight text-foreground">{pct}%</p>
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>

      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
