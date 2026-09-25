"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
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
 * Inline "Search Anything" — types straight into the topbar bar itself (a real cmdk Command,
 * not a Dialog), with results dropping down directly under it. Replaces the earlier
 * click-to-open-a-centered-popup flow: a click still focuses the input (nothing changes there),
 * but there's no separate window to open first — the same bar IS the input, and the same ⌘K
 * shortcut now just focuses it instead of launching a popup. One dropdown behavior on every
 * screen size, including mobile, rather than a different full-screen experience there.
 */
export function CommandTrigger() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: orders } = useOrders();
  const { data: entitlements } = useModuleEntitlements();
  const restricted = !!user?.restricted;
  const isAdmin = user?.role === "admin";
  const isSuperAdmin = !!user?.isSuperAdmin;
  // Same "restricted role" gate the Customers/Employees nav items themselves use — a
  // record-search result is exactly as sensitive as the page it would otherwise require
  // navigating to, so it's gated the same way rather than left as a search-only backdoor.
  const { data: customers } = useCustomers();
  const { data: invoices } = useSalesInvoices();
  const { data: products } = useProducts();
  const { data: employeeDirectory } = useEmployees();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const orderSettings = ORDERS_GROUP.children
      .filter((c) => c.href.startsWith("/settings/") && ordersLeafVisible(c.href, !restricted) && (isSuperAdmin || !entitlements || isSettingEnabled(entitlements, c.href)))
      .map((c) => ({ href: c.href, label: `Stitching Orders · ${c.label}` }));
    return { flat, reports, settings, employees, orderSettings };
  }, [restricted, isAdmin, isSuperAdmin, entitlements]);

  function close() {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  // Click outside the whole bar+dropdown closes it, same as a Dialog's overlay click would have.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // ⌘K / Ctrl+K focuses the bar (and opens the dropdown) instead of launching a popup.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      } else if (e.key === "Escape" && open) {
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hasResults = (orders || []).length > 0 || (customers || []).length > 0 || (invoices || []).length > 0 || (products || []).length > 0 || (employeeDirectory || []).length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Command shouldFilter className="overflow-visible bg-transparent p-0">
        <div className="relative">
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onFocus={() => setOpen(true)}
            placeholder="Search Anything…"
            className="h-9! text-sm"
          />
          {!open && !query && (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-background px-1.5 font-sans text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          )}
        </div>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
            <CommandList className="max-h-[70vh] sm:max-h-96">
              {hasResults || pages.flat.length > 0 ? (
                <>
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
                </>
              ) : (
                <CommandPrimitive.Empty className="py-6 text-center text-sm">Loading…</CommandPrimitive.Empty>
              )}
            </CommandList>
          </div>
        )}
      </Command>
    </div>
  );
}
