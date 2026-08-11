"use client";

import { NavContent, NavBrand } from "@/components/app-shell/nav-content";

/** Desktop sidebar. Mobile navigation lives in mobile-nav.tsx (drawer + bottom tabs). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <NavBrand />
      <div className="flex-1 overflow-y-auto">
        <NavContent />
      </div>
    </aside>
  );
}
