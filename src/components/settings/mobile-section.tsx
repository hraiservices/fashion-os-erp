"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * Collapses a group of settings cards behind a single tap-to-expand header, mobile only.
 * Several /settings pages stack many independent Cards vertically (Personalize merges four
 * such groups onto one page) — on a phone that's a lot of scrolling before reaching the one
 * section a visit is usually about.
 *
 * Renders children exactly once (never both the mobile and desktop variant at the same time —
 * each section component underneath does its own data fetching, so mounting it twice would
 * double every request). Desktop/tablet (`sm:` and up, via `useMediaQuery`) always renders
 * children directly with no wrapper chrome; before hydration and on mobile it's safe to default
 * to expanded too — so the only state that ever hides content is this component's own, explicit
 * `open` toggle once we know we're on a small screen.
 */
export function MobileSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(defaultOpen);

  if (isDesktop) {
    return (
      <div className="space-y-4">
        <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pt-0">{title}</p>
        {children}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>{title}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-4 pt-1">{children}</div>}
    </div>
  );
}
