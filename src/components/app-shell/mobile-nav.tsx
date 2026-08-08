"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_TABS } from "@/components/app-shell/nav-config";
import { NavContent, NavBrand } from "@/components/app-shell/nav-content";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Mobile drawer trigger — the app previously had NO mobile navigation at all
 * (the sidebar was `hidden md:flex` with nothing replacing it), so on a phone
 * users were stranded on whatever page they landed on.
 */
export function MobileNavTrigger() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens, so it never lingers over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Open menu" className="size-9 lg:hidden" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[17rem] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <NavBrand />
          <div className="flex-1 overflow-y-auto">
            <NavContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Thumb-reachable bottom tab bar with a centre "New order" action, in the style of
 * native mobile apps. Hidden on lg+ where the sidebar takes over.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const restricted = !!user?.restricted;
  const tabs = MOBILE_TABS.filter((t) => !(restricted && t.restricted));
  const canAdd = user?.perms.addOrder;

  // Split tabs around the centre FAB so it sits in the middle of the bar.
  const mid = Math.ceil(tabs.length / 2);
  const left = tabs.slice(0, mid);
  const right = tabs.slice(mid);

  function TabLink({ href, label, icon: Icon }: (typeof MOBILE_TABS)[number]) {
    const active = pathname === href.split("?")[0];
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    );
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {left.map(TabLink)}
      {canAdd && (
        <Link
          href="/orders/new"
          aria-label="New order"
          className="relative -top-3 mx-1 flex size-12 shrink-0 items-center justify-center self-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95"
        >
          <Plus className="size-6" />
        </Link>
      )}
      {right.map(TabLink)}
    </nav>
  );
}
