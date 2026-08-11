"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PRIMARY_NAV, SECONDARY_NAV, REPORTS_GROUP, resolveReportSection, SETTINGS_GROUP, settingsLeafVisible } from "@/components/app-shell/nav-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOrders } from "@/hooks/use-orders";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isReportEnabled, isSettingEnabled } from "@/lib/entitlements";
import { STAGE_META } from "@/lib/business-rules";

/**
 * ⌘K / Ctrl+K palette — jump to any page or straight to a specific order by
 * customer name, mobile, or order ID. Replaces hunting through nav menus.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: orders } = useOrders();
  const { data: entitlements } = useModuleEntitlements();
  const restricted = !!user?.restricted;
  const isAdmin = user?.role === "admin";
  const isSuperAdmin = !!user?.isSuperAdmin;

  const pages = useMemo(() => {
    const flat = [...PRIMARY_NAV, ...SECONDARY_NAV].filter((i) => !(restricted && i.restricted)).map((i) => ({ href: i.href, label: i.label }));
    const reports =
      restricted || !entitlements
        ? []
        : REPORTS_GROUP.children.filter((c) => isReportEnabled(entitlements, c.href, resolveReportSection(c.href))).map((c) => ({ href: c.href, label: `Reports · ${c.label}` }));
    const settings = SETTINGS_GROUP.children
      .filter((c) => settingsLeafVisible(c.href, isAdmin, !restricted, isSuperAdmin) && (isSuperAdmin || !entitlements || isSettingEnabled(entitlements, c.href)))
      .map((c) => ({ href: c.href, label: `Settings · ${c.label}` }));
    return { flat, reports, settings };
  }, [restricted, isAdmin, isSuperAdmin, entitlements]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page or an order">
      <CommandInput placeholder="Search orders, customers, pages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {(orders || []).length > 0 && (
          <CommandGroup heading="Stitching Orders">
            {(orders || []).slice(0, 50).map((o) => (
              <CommandItem key={o.id} value={`${o.name} ${o.mobile} ${o.id}`} onSelect={() => go(`/orders/${o.id}`)}>
                <span className="truncate">{o.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {o.id} · {STAGE_META[o.status].label}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          {pages.flat.map((p) => (
            <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {pages.reports.length > 0 && (
          <CommandGroup heading="Reports">
            {pages.reports.map((p) => (
              <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Settings">
          {pages.settings.map((p) => (
            <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Topbar search affordance that opens the palette; also binds the ⌘K shortcut. */
export function CommandTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search orders, customers…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 font-sans text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
