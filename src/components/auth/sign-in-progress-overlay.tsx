"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Full-screen "signing you in" screen shown between a successful login and the dashboard
 * actually landing — covers the gap where router.push() has fired but Next hasn't finished
 * loading the /dashboard route + its data yet, which otherwise reads as the page silently
 * hanging (the submit button's own spinner turns off the instant auth succeeds, well before
 * the dashboard is actually ready).
 *
 * Deliberately dark and animation-forward — a spinning dual conic-gradient ring with orbiting
 * particles around the logo, drifting mesh-gradient backdrop, shimmering gradient percentage
 * text — distinct from the light login card behind it, so the transition itself feels like
 * something is actively happening rather than a plain spinner/bar. All the keyframes live in
 * globals.css under the ai-* prefix, same convention as the login-* ones the card above uses.
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
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-zinc-950">
      {/* Drifting mesh-gradient backdrop — purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-ai-mesh absolute -top-40 -left-20 size-[32rem] rounded-full bg-violet-600/30 blur-[120px]" />
        <div className="animate-ai-mesh-slow absolute -right-24 -bottom-40 size-[34rem] rounded-full bg-cyan-500/20 blur-[130px]" />
        <div className="animate-ai-mesh absolute top-1/3 left-1/2 size-96 -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(9,9,11,0.5)_100%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-6">
        {/* Spinning AI-ring core */}
        <div className="relative flex size-28 items-center justify-center">
          <div
            aria-hidden
            className="animate-ai-ring-spin absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 0%, #8b5cf6 35%, #22d3ee 60%, transparent 100%)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))",
            }}
          />
          <div
            aria-hidden
            className="animate-ai-ring-spin-reverse absolute inset-2 rounded-full opacity-70"
            style={{
              background: "conic-gradient(from 180deg, transparent 0%, #e879f9 40%, transparent 75%)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))",
            }}
          />

          <span
            aria-hidden
            className="animate-ai-orbit-dot absolute size-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.7)]"
            style={{ "--orbit-radius": "50px" } as React.CSSProperties}
          />
          <span
            aria-hidden
            className="animate-ai-orbit-dot absolute size-1.5 rounded-full bg-violet-300 shadow-[0_0_8px_2px_rgba(196,181,253,0.7)]"
            style={{ "--orbit-radius": "50px", animationDelay: "-1.6s" } as React.CSSProperties}
          />

          <div className="animate-ai-core-pulse relative flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/80 shadow-[0_0_30px_rgba(139,92,246,0.35)] backdrop-blur">
            {logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoDataUrl} alt={shopName || "Company logo"} className="size-full rounded-2xl object-contain p-1.5" />
            ) : (
              <Sparkles className="size-7 text-violet-300" />
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p
            className="animate-ai-text-shimmer bg-gradient-to-r from-violet-300 via-cyan-200 to-fuchsia-300 bg-clip-text text-5xl font-semibold tracking-tight text-transparent tabular-nums"
            style={{ backgroundSize: "200% auto" }}
          >
            {pct}%
          </p>
          <p className="text-sm text-zinc-400">{shopName ? `Preparing ${shopName}…` : "Signing you in…"}</p>
        </div>

        <div className="relative h-1 w-64 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400 transition-[width] duration-150 ease-out" style={{ width: `${pct}%` }} />
          <div aria-hidden className="animate-ai-bar-shimmer absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>
      </div>
    </div>
  );
}
