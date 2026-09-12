"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavContent, NavBrand } from "@/components/app-shell/nav-content";
import { cn } from "@/lib/utils";

/**
 * Desktop sidebar. Mobile navigation lives in mobile-nav.tsx (drawer + bottom tabs).
 * Collapse state is a plain in-memory `useState` — deliberately not persisted (per the
 * user's choice): every fresh page load starts expanded, no localStorage/DB round trip.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    // h-screen before h-dvh: a browser/webview without dvh support ignores that whole
    // declaration (invalid unit) and falls back to the vh one instead of collapsing the aside
    // to its content height — which otherwise left a gap below the last nav item on any
    // shorter screen where NavContent doesn't fill a full viewport, revealing the page's own
    // background through the empty rest of this sticky column.
    // `overflow-visible` (not `overflow-hidden`) so the floating toggle button below can sit
    // half on/half off the right edge — the scrollable NavContent below still clips its own
    // vertical overflow via its own `overflow-y-auto` wrapper, and collapsed-group flyouts are
    // portaled (see nav-content.tsx), so nothing relies on this aside clipping its contents.
    <aside
      className={cn(
        "sticky top-0 hidden h-screen h-dvh shrink-0 flex-col overflow-visible border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <NavBrand collapsed={collapsed} />
        <div className="flex-1 overflow-y-auto">
          <NavContent collapsed={collapsed} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-16 -right-3 z-20 flex size-6 items-center justify-center rounded-full border border-sidebar-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
    </aside>
  );
}
