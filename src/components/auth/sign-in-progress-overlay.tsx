"use client";

import { useEffect, useState } from "react";
import { FF_LOGO_ASPECT, FF_LOGO_PIECES, ffLogoSrc, type LogoPiece } from "@/lib/brand-logo-pieces";
import { cn } from "@/lib/utils";

/**
 * Full-screen "signing you in" screen shown between a successful login and the dashboard
 * actually landing — covers the gap where router.push() has fired but Next hasn't finished
 * loading the /dashboard route + its data yet, which otherwise reads as the page silently
 * hanging (the submit button's own spinner turns off the instant auth succeeds, well before
 * the dashboard is actually ready).
 *
 * A plain white screen with the Fashion Flow wordmark building itself, letter by letter, as the
 * percentage climbs: each of the logo's 17 shapes (see brand-logo-pieces.ts) pops in once the
 * counter passes its own threshold, so at 50% about half the logo is there. The last piece, the
 * red arrow, is held back past the cap and lands when the caller flips `done` — the logo
 * completes at the same moment the dashboard is ready to open.
 *
 * It is always the Fashion Flow logo, whichever shop is signing in; the shop's own name is
 * shown beneath it ("Preparing <shop>…") so they still see theirs.
 *
 * The percentage is a smooth animated climb, not tied to real request/route-load progress —
 * deliberately: chaining it to actual steps (auth verified → role loaded → dashboard data
 * fetched) risks looking stuck at 90% if any one step is slow, and the real timeline varies too
 * much between mobile+PIN and email login to represent honestly as discrete steps anyway. This
 * animates to ~92% over ~1.4s, then the caller flips `done` once it's ready to navigate, which
 * snaps the rest of the way to 100% quickly before router.push() actually fires.
 */
export function SignInProgressOverlay({ shopName, done }: { shopName?: string; done: boolean }) {
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
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-9 px-6">
        <span className="sr-only">Fashion Flow</span>

        {/* The wordmark, assembled from its own pieces. Sized by width; the height follows the artwork's aspect ratio. */}
        <div aria-hidden className="relative w-[min(80vw,24rem)]" style={{ aspectRatio: FF_LOGO_ASPECT }}>
          {FF_LOGO_PIECES.map((piece, i) => (
            <LogoPieceImage key={piece.file} piece={piece} shown={pct >= appearsAt(i)} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <p className="text-4xl font-semibold tracking-tight text-zinc-800 tabular-nums">{pct}%</p>
          <p className="text-sm text-zinc-500">{shopName ? `Preparing ${shopName}…` : "Signing you in…"}</p>
        </div>

        {/* Thin progress line in the logo's own colours, in the same order as the letters of "Fashion".
            The gradient is pinned to the full track (not the filled part), so each colour is revealed
            as the bar reaches it instead of the whole rainbow squeezing into a short fill. */}
        <div className="relative h-1 w-64 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full transition-[width] duration-150 ease-out"
            style={{
              width: `${pct}%`,
              backgroundImage: `linear-gradient(90deg, ${LOGO_BAR_COLOURS})`,
              backgroundSize: "16rem 100%",
              backgroundRepeat: "no-repeat",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** The logo's own colours — F, a, s, h, o, n — as read from the artwork. */
const LOGO_BAR_COLOURS = "#f80a0a 0%, #0ab156 22%, #096bd0 42%, #fcc10f 62%, #7a32a3 82%, #0bb1fa 100%";

/**
 * The percentage at which piece `index` lands: spread evenly from 4% to 95%. 95 sits above the
 * 92% cap on purpose — the last piece (the arrow) only appears when sign-in actually completes.
 */
function appearsAt(index: number): number {
  const last = FF_LOGO_PIECES.length - 1;
  return 4 + (index / last) * 91;
}

/** Where a piece starts from before it lands: letters spring up, dots drop in, the arrow slides in from the left. */
const ENTRY_FROM: Record<LogoPiece["kind"], string> = {
  letter: "translateY(28%) scale(0.55)",
  dot: "translateY(-160%) scale(0.4)",
  arrow: "translateX(-60%) scale(0.7)",
};

function LogoPieceImage({ piece, shown }: { piece: LogoPiece; shown: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative cut-outs sized by percentage; next/image's wrapper would break the exact overlay
    <img
      src={ffLogoSrc(piece)}
      alt=""
      draggable={false}
      className={cn(
        "absolute select-none transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0"
      )}
      style={{
        left: `${piece.left}%`,
        top: `${piece.top}%`,
        width: `${piece.w}%`,
        height: `${piece.h}%`,
        transform: shown ? "none" : ENTRY_FROM[piece.kind],
      }}
    />
  );
}
