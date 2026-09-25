"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PRIMARY_NAV, SECONDARY_NAV, REPORTS_GROUP, resolveReportSection, SETTINGS_GROUP, settingsLeafVisible, EMPLOYEES_GROUP, employeesLeafVisible, ORDERS_GROUP, ordersLeafVisible } from "@/components/app-shell/nav-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOrders } from "@/hooks/use-orders";
import { useCustomers } from "@/hooks/use-customers";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { useEmployees } from "@/hooks/use-employees";
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
  // Same "restricted role" gate the Customers/Employees nav items themselves use — a
  // record-search result is exactly as sensitive as the page it would otherwise require
  // navigating to, so it's gated the same way rather than left as a search-only backdoor.
  const { data: customers } = useCustomers();
  const { data: invoices } = useSalesInvoices();
  const { data: products } = useProducts();
  const { data: employeeDirectory } = useEmployees();
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
    const employees =
      restricted
        ? []
        : EMPLOYEES_GROUP.children
            .filter((c) => employeesLeafVisible(c.href, isAdmin) && (isSuperAdmin || !entitlements || isSettingEnabled(entitlements, c.href)))
            .map((c) => ({ href: c.href, label: `Employees · ${c.label}` }));
    // Only the two settings-config leaves (Rate Card, Measurements) — "All Orders"/"Search
    // Measurement" aren't quick-jump entries here, same as before this group existed, to avoid
    // duplicating the live order-record results already shown under "Stitching Orders" above.
    const orderSettings = ORDERS_GROUP.children
      .filter((c) => c.href.startsWith("/settings/") && ordersLeafVisible(c.href, !restricted) && (isSuperAdmin || !entitlements || isSettingEnabled(entitlements, c.href)))
      .map((c) => ({ href: c.href, label: `Stitching Orders · ${c.label}` }));
    return { flat, reports, settings, employees, orderSettings };
  }, [restricted, isAdmin, isSuperAdmin, entitlements]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page, an order, a customer, or anything else in the app">
      <CommandInput placeholder="Search Anything…" />
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

        {!restricted && (customers || []).length > 0 && (
          <CommandGroup heading="Customers">
            {(customers || []).slice(0, 50).map((c) => (
              <CommandItem key={c.mobile} value={`${c.name} ${c.mobile}`} onSelect={() => go(`/crm/${c.mobile}`)}>
                <span className="truncate">{c.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{c.mobile}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!restricted && (invoices || []).length > 0 && (
          <CommandGroup heading="Sales Invoices">
            {(invoices || []).slice(0, 50).map((inv) => (
              <CommandItem key={inv.id} value={`${inv.invoiceNumber} ${inv.customerName}`} onSelect={() => go(`/sales/invoices/${inv.id}`)}>
                <span className="truncate">{inv.customerName}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{inv.invoiceNumber}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!restricted && (products || []).length > 0 && (
          <CommandGroup heading="Products">
            {(products || []).slice(0, 50).map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.sku} ${p.barcode || ""}`} onSelect={() => go(`/inventory/products/${p.id}`)}>
                <span className="truncate">{p.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.sku}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!restricted && (employeeDirectory || []).length > 0 && (
          <CommandGroup heading="Employees">
            {(employeeDirectory || []).slice(0, 50).map((e) => (
              <CommandItem key={e.id} value={`${e.name} ${e.mobile}`} onSelect={() => go(`/employees/${e.id}`)}>
                <span className="truncate">{e.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{e.role}</span>
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

        {pages.employees.length > 0 && (
          <CommandGroup heading="Employees">
            {pages.employees.map((p) => (
              <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {pages.orderSettings.length > 0 && (
          <CommandGroup heading="Stitching Orders Settings">
            {pages.orderSettings.map((p) => (
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
        <span className="truncate">Search Anything…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 font-sans text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
