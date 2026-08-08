"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, ChevronDown, Plus, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, SECONDARY_NAV, MANUFACTURING_NAV_ITEM, COPILOT_NAV_ITEM, settingsLeafVisible, type NavGroup, type NavLeaf, type NavFlatItem } from "@/components/app-shell/nav-config";
import { resolveNavLayout, DEFAULT_NAV_LAYOUT, type NavLayoutSetting } from "@/lib/nav-layout";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Some flat nav items share a base path but differ only by query string (e.g. Orders
 * "/orders" vs Board "/orders?view=board") — a plain pathname compare would mark both
 * active at once. Among items sharing a path, an item with query params wins only if
 * every one of its params matches the current URL exactly; otherwise the bare (no
 * query) item is the active one. This keeps exactly one match per path group.
 */
function computeActiveHref(items: NavFlatItem[], pathname: string, searchParams: URLSearchParams): string | undefined {
  const candidates = items.filter((i) => i.href.split("?")[0] === pathname);
  if (candidates.length === 0) return undefined;
  const withQuery = candidates.filter((i) => i.href.includes("?"));
  const matched = withQuery.find((i) => {
    const q = new URLSearchParams(i.href.split("?")[1]);
    return Array.from(q.entries()).every(([k, v]) => searchParams.get(k) === v);
  });
  if (matched) return matched.href;
  return candidates.find((i) => !i.href.includes("?"))?.href;
}

/** Small "+" quick-add icon next to a nav row — jumps straight into that module's create flow. */
function NewLink({ href, onNavigate, label }: { href: string; onNavigate?: () => void; label: string }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={`Add new ${label}`}
      title={`Add new ${label}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <Plus className="size-3.5" />
    </Link>
  );
}

function FlatLink({ item, active, onNavigate }: { item: NavFlatItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-0.5">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
      {item.newHref && <NewLink href={item.newHref} onNavigate={onNavigate} label={item.label} />}
    </div>
  );
}

/** Groups whose index page already is the full browsing UI (category rail + searchable table) — no need to duplicate that structure as a sidebar dropdown too. Clicking just navigates straight there. */
function GroupIndexLink({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  const Icon = group.icon;
  const active = pathname.startsWith(`/${group.id}`);
  return (
    <Link
      href={group.indexHref!}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{group.label}</span>
    </Link>
  );
}

function GroupNav({
  group,
  childrenOverride,
  pathname,
  filterLeaf,
  onNavigate,
}: {
  group: NavGroup;
  /** Resolved (reordered/re-grouped/hidden) children from the admin nav layout — falls back to the group's static default list. */
  childrenOverride?: NavLeaf[];
  pathname: string;
  filterLeaf?: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const groupActive = pathname.startsWith(`/${group.id}`);
  const [open, setOpen] = useState(groupActive);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const Icon = group.icon;
  const children = (childrenOverride ?? group.children).filter((l) => (filterLeaf ? filterLeaf(l.href) : true));
  if (children.length === 0) return null;

  // Bucket the flat children list into sections (leaves without a `section` tag stay in one
  // unlabeled bucket, rendered exactly as before — this only changes groups that opt in).
  const sections: { label: string | null; items: typeof children }[] = [];
  children.forEach((leaf) => {
    if (leaf.section) sections.push({ label: leaf.section, items: [leaf] });
    else if (sections.length && sections[sections.length - 1].label === null) sections[sections.length - 1].items.push(leaf);
    else sections.push({ label: null, items: [leaf] });
  });

  function toggleSection(label: string) {
    setCollapsedSections((c) => ({ ...c, [label]: !c[label] }));
  }

  const rowClass = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    groupActive ? "text-sidebar-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  );

  // Only pin a separate "Overview" link when the group's index page isn't already one of
  // its listed items (e.g. Expenses already lists "All Expenses" — no need to duplicate it).
  const showPinnedOverview = !!group.indexHref && !children.some((l) => l.href === group.indexHref);

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={rowClass}>
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-0.5 ml-[1.4rem] space-y-0.5 border-l pl-3">
          {showPinnedOverview && (
            <Link
              href={group.indexHref!}
              onClick={onNavigate}
              aria-current={pathname === group.indexHref ? "page" : undefined}
              className={cn(
                "block truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                pathname === group.indexHref ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              )}
            >
              Overview
            </Link>
          )}
          {sections.map((section, si) => {
            const sectionOpen = section.label ? !collapsedSections[section.label] : true;
            return (
              <div key={section.label ?? `_${si}`} className={si > 0 ? "mt-1" : undefined}>
                {section.label && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.label!)}
                    aria-expanded={sectionOpen}
                    className="flex w-full items-center gap-1 rounded px-2.5 pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/35 hover:text-sidebar-foreground/60"
                  >
                    <span className="flex-1">{section.label}</span>
                    <ChevronDown className={cn("size-3 shrink-0 transition-transform duration-200", !sectionOpen && "-rotate-90")} />
                  </button>
                )}
                {sectionOpen &&
                  section.items.map((leaf) => {
                    const active = pathname === leaf.href;
                    return (
                      <div key={leaf.href} className="flex items-center gap-0.5">
                        <Link
                          href={leaf.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "block flex-1 truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                            active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                          )}
                        >
                          {leaf.label}
                        </Link>
                        {leaf.newHref && <NewLink href={leaf.newHref} onNavigate={onNavigate} label={leaf.label} />}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const NAV_SKELETON = (
  <div className="space-y-1.5 px-3">
    {Array.from({ length: 7 }).map((_, i) => (
      <Skeleton key={i} className="h-9 w-full" />
    ))}
  </div>
);

/**
 * Shared nav body used by both the desktop sidebar and the mobile drawer. Wrapped in its
 * own Suspense boundary because it reads useSearchParams() (to tell Orders vs Board apart)
 * — without this, every page rendered inside the (app) layout would be forced to bail out
 * of static prerendering just because the sidebar exists.
 */
export function NavContent(props: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={NAV_SKELETON}>
      <NavContentInner {...props} />
    </Suspense>
  );
}

const ALL_FLAT_ITEMS: NavFlatItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV, MANUFACTURING_NAV_ITEM, COPILOT_NAV_ITEM];

function NavContentInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: user, isLoading } = useCurrentUser();
  const { data: savedLayout, isLoading: layoutLoading } = useAppSetting<NavLayoutSetting>("navLayout", DEFAULT_NAV_LAYOUT);

  const isAdmin = user?.role === "admin";
  const canManageShop = !user?.restricted;
  const restricted = !!user?.restricted;

  if (isLoading || layoutLoading) {
    return (
      <div className="space-y-1.5 px-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const activeHref = computeActiveHref(ALL_FLAT_ITEMS, pathname, searchParams);
  const { roots } = resolveNavLayout(savedLayout);

  /** Same visibility rules as before the layout became admin-editable — the admin can hide/reorder/regroup, but never bypass role permissions. */
  function rootVisible(node: (typeof roots)[number]): boolean {
    if (node.kind === "flat") {
      if (node.item.href === MANUFACTURING_NAV_ITEM.href) return !!user?.perms.manageManufacturing;
      if (node.item.href === COPILOT_NAV_ITEM.href) return !!user?.perms.useChatbot;
      if (SECONDARY_NAV.some((i) => i.href === node.item.href)) return !restricted;
      return !(restricted && node.item.restricted);
    }
    switch (node.group.id) {
      case "reports":
      case "expenses":
        return !restricted;
      case "sales":
        return !!user?.perms.manageSales;
      case "inventory":
        return !!user?.perms.manageInventory;
      case "purchases":
        return !!user?.perms.managePurchases;
      case "settings":
        return true;
      default:
        return true;
    }
  }

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
      {roots.filter(rootVisible).map((node) =>
        node.kind === "flat" ? (
          <FlatLink key={node.item.href} item={node.item} active={node.item.href === activeHref} onNavigate={onNavigate} />
        ) : node.group.id === "reports" ? (
          <GroupIndexLink key={node.group.id} group={node.group} pathname={pathname} onNavigate={onNavigate} />
        ) : (
          <GroupNav
            key={node.group.id}
            group={node.group}
            childrenOverride={node.children}
            pathname={pathname}
            filterLeaf={node.group.id === "settings" ? (href) => settingsLeafVisible(href, isAdmin, canManageShop) : undefined}
            onNavigate={onNavigate}
          />
        )
      )}
    </nav>
  );
}

export function NavBrand() {
  const { data: shop } = useShopSettings();
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      {shop?.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shop.logoDataUrl} alt={shop.name || "Shop logo"} className="size-8 shrink-0 rounded-lg border bg-white object-contain" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Scissors className="size-4" />
        </span>
      )}
      <span className="truncate text-[15px] font-semibold tracking-tight">{shop?.name || "Stitch Manager"}</span>
    </div>
  );
}
