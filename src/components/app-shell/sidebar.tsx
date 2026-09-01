"use client";

import { NavContent, NavBrand } from "@/components/app-shell/nav-content";

/** Desktop sidebar. Mobile navigation lives in mobile-nav.tsx (drawer + bottom tabs). */
export function Sidebar() {
  return (
    // h-screen before h-dvh: a browser/webview without dvh support ignores that whole
    // declaration (invalid unit) and falls back to the vh one instead of collapsing the aside
    // to its content height — which otherwise left a gap below the last nav item on any
    // shorter screen where NavContent doesn't fill a full viewport, revealing the page's own
    // background through the empty rest of this sticky column.
    <aside className="sticky top-0 hidden h-screen h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <NavBrand />
      <div className="flex-1 overflow-y-auto">
        <NavContent />
      </div>
    </aside>
  );
}
