"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * When a repeat customer's tracking link lists several orders, each one's own card (timeline,
 * garments, photos) adds up to a lot of scrolling on a phone before reaching the order actually
 * being checked on. Collapses every order after the first behind a tap-to-expand summary row —
 * mobile only; desktop/tablet always shows every order's card in full, same as before.
 */
export function OrderCollapse({
  summary,
  defaultOpen,
  children,
}: {
  /** Compact always-visible row — order id + stage badge, shown whether expanded or not. */
  summary: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(defaultOpen);

  if (isDesktop || open) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4">
        {!isDesktop && (
          <button type="button" onClick={() => setOpen(false)} className="-m-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg p-1 text-left">
            {summary}
            <ChevronDown className="size-4 shrink-0 rotate-180" />
          </button>
        )}
        {children}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border bg-card p-4 text-left">
      {summary}
      <ChevronDown className={cn("size-4 shrink-0")} />
    </button>
  );
}
