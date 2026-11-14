"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Phase = "idle" | "trickling" | "finishing";

/**
 * A slim top-of-page progress bar for every in-app navigation — sidebar links, table row
 * links, breadcrumbs, dropdown menu items, anything rendered as a plain <a>. Purely cosmetic:
 * it isn't tied to real load progress (this app has no router-level "navigation started" event
 * to hook — Next's App Router exposes none short of this), since actual load time varies too
 * much between a cached query and a cold fetch to represent honestly as discrete progress
 * anyway. The point is just "something registered the tap", which is the single biggest
 * missing piece behind pages feeling like they open with a flat "hit" instead of a transition.
 *
 * Mechanics: a document-level, capture-phase click listener (so it fires on the press itself,
 * before React's own handlers, and needs no changes to any individual Link/Button) starts a
 * trickle the moment a same-tab, same-origin link to a *different* pathname is clicked;
 * usePathname() actually changing is what means the new route mounted, which snaps the bar to
 * 100% and fades it out. Animates transform (scaleX) and opacity only, never width, so it
 * composites instead of forcing layout — the difference between smooth and janky on a
 * mid-range phone. prefers-reduced-motion collapses the transition durations to ~0 globally
 * (globals.css); this component doesn't need its own check for that.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const barRef = useRef<HTMLDivElement>(null);
  const prevPathname = useRef(pathname);

  // Start: a same-tab, same-origin link to a different page was clicked anywhere in the app.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || /^(mailto|tel):/i.test(href)) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Different origin (external link) or only the hash/query changed on the same page (e.g.
      // a tab switch via ?tab=) isn't a "navigation" this bar is for — and the latter would
      // never fire the pathname-change effect below to turn it off again.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setPhase("trickling");
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Finish: the pathname actually changed — the new route mounted.
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;
    setPhase((p) => (p === "trickling" ? "finishing" : p));
  }, [pathname]);

  // Drives the bar's own transform imperatively (not via Tailwind classes) so the trickle can
  // start from scaleX(0) and animate to its resting point on the *next* frame — a class-based
  // transition can't do that in one render, since the element would mount already at its
  // target state with nothing to transition from.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    if (phase === "trickling") {
      el.style.transition = "none";
      el.style.transform = "scaleX(0)";
      void el.offsetWidth; // force layout so the next write is a separate, transitioning step
      el.style.transition = "transform 6s cubic-bezier(0.1,0.6,0.2,1)";
      el.style.transform = "scaleX(0.85)";
    } else if (phase === "finishing") {
      el.style.transition = "transform 200ms ease-out";
      el.style.transform = "scaleX(1)";
    }
  }, [phase]);

  // Unmounts shortly after finishing — long enough for the fade-out below to play first.
  useEffect(() => {
    if (phase !== "finishing") return;
    const t = setTimeout(() => setPhase("idle"), 320);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden" aria-hidden>
      <div
        ref={barRef}
        className={cn("h-full w-full origin-left bg-primary", phase === "finishing" && "opacity-0 transition-opacity delay-100 duration-150")}
      />
    </div>
  );
}
