"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Plus, ClipboardList, Receipt, Wallet, UserPlus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_TABS } from "@/components/app-shell/nav-config";
import { NavContent, NavBrand } from "@/components/app-shell/nav-content";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { buildSupportWhatsAppHref } from "@/components/app-shell/copilot-bubble";
import { useCopilotOpen } from "@/components/app-shell/copilot-context";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { hapticTap } from "@/lib/haptics";
import { Sheet, SheetContent, SheetTitle, SheetHeader } from "@/components/ui/sheet";
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
  useSyncFromSource(pathname, () => setOpen(false));

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Open menu" className="size-11 sm:size-9 lg:hidden" onClick={() => setOpen(true)}>
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
  return (
    <Suspense fallback={<MobileTabBarInner searchParams={null} />}>
      <MobileTabBarWithSearchParams />
    </Suspense>
  );
}

function MobileTabBarWithSearchParams() {
  const searchParams = useSearchParams();
  return <MobileTabBarInner searchParams={searchParams} />;
}

function MobileTabBarInner({ searchParams }: { searchParams: ReturnType<typeof useSearchParams> | null }) {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const { data: entitlements } = useModuleEntitlements();
  const { open: copilotOpen, setOpen: setCopilotOpen } = useCopilotOpen();
  const [createOpen, setCreateOpen] = useState(false);
  const restricted = !!user?.restricted;
  const tabs = MOBILE_TABS.filter((t) => !(restricted && t.restricted));
  const canAdd = user?.perms.addOrder;
  const canUseCopilot = !!user?.perms.useChatbot && isModuleEnabled(entitlements ?? DEFAULT_ENTITLEMENTS, "copilot");
  const supportHref = buildSupportWhatsAppHref(shop?.name);

  const createOptions = [
    { href: "/orders/new", label: "New Order", icon: ClipboardList, show: user?.perms.addOrder },
    { href: "/sales/invoices/new", label: "New Invoice", icon: Receipt, show: user?.perms.manageSales },
    { href: "/expenses/new", label: "New Expense", icon: Wallet, show: true },
    { href: "/crm/new", label: "New Customer", icon: UserPlus, show: user?.perms.manageCustomers || user?.role === "admin" || user?.role === "manager" },
  ].filter((o) => o.show);

  // Nav tabs (Home/Orders/Board/Clients) sit left of the centre "+" FAB; Support and Copilot
  // sit right of it — a fixed grouping rather than an even left/right split, so navigation and
  // the two utility actions don't get shuffled around each other as tabs are added/removed.

  function TabLink({ href, label, icon: Icon }: (typeof MOBILE_TABS)[number]) {
    const [hrefPath, hrefQuery] = href.split("?");
    // Compare the query string too — otherwise every tab whose href points at the same
    // pathname with a different `?view=` (e.g. "Orders" vs "Board", both /orders) lights
    // up together regardless of which one is actually selected.
    const active = pathname === hrefPath && (hrefQuery ?? "") === (searchParams?.toString() ?? "");
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
        <span className={cn("flex items-center justify-center rounded-full px-3 py-0.5 transition-colors", active && "bg-primary/10")}>
          <Icon className={cn("size-5 transition-transform", active && "scale-110")} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
        </span>
        {label}
      </Link>
    );
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {tabs.map(TabLink)}
      {canAdd && (
        <button
          type="button"
          aria-label="Create new…"
          onClick={() => {
            hapticTap();
            setCreateOpen(true);
          }}
          className="relative -top-3 mx-1 flex size-12 shrink-0 items-center justify-center self-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95"
        >
          <Plus className="size-6" />
        </button>
      )}
      {/* WhatsApp support + AI Copilot live here instead of floating over page content — see
          CopilotBubble, whose own FAB stack is now desktop (lg+) only. */}
      <a
        href={supportHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => hapticTap()}
        className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors"
      >
        <span className="flex items-center justify-center rounded-full px-3 py-0.5">
          <WhatsAppIcon className="size-5 text-[#25D366]" />
        </span>
        Support
      </a>
      {canUseCopilot && (
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setCopilotOpen((o) => !o);
          }}
          aria-pressed={copilotOpen}
          className={cn("flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors", copilotOpen ? "text-primary" : "text-muted-foreground")}
        >
          <span className={cn("flex items-center justify-center rounded-full px-3 py-0.5 transition-colors", copilotOpen && "bg-primary/10")}>
            {copilotOpen ? <X className="size-5" /> : <Sparkles className={cn("size-5 transition-transform", copilotOpen && "scale-110")} />}
          </span>
          Copilot
        </button>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Create new</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            {createOptions.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setCreateOpen(false)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium transition-colors active:bg-muted/50"
              >
                <Icon className="size-6 text-primary" />
                {label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
