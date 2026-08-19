// Lets an admin hide, reorder, and re-group sidebar entries without touching code. The
// static NAV_CONFIG (nav-config.ts) stays the single source of truth for what every item
// actually IS (href/label/icon/permission gating) — this layer only decides where each
// item sits and whether it's shown, stored as a shop-wide app_setting ("navLayout").
//
// Two kinds of customization:
//  1. Root order — the top-to-bottom order of everything the sidebar renders directly:
//     flat pages (Dashboard, Board, …) and whole groups (Reports, Sales, …), each
//     individually hideable.
//  2. Group membership — leaves inside the six "movable" groups (Reports, Expenses,
//     Product Sales, Inventory, Purchases, Settings) can be hidden, reordered within
//     their group, or moved into any other movable group. `groupChildren` is the full
//     current truth once saved (not a diff) — moving a leaf means removing its href from
//     one group's array and appending it to another's.
//
// Anything new added to NAV_CONFIG later (a new report, a new group) that isn't yet
// mentioned in a saved layout is appended at the end automatically — old saved layouts
// never hide new items by accident.
import type { LucideIcon } from "lucide-react";
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  ORDERS_GROUP,
  REPORTS_GROUP,
  EXPENSES_GROUP,
  SALES_GROUP,
  INVENTORY_GROUP,
  PURCHASES_GROUP,
  SETTINGS_GROUP,
  EMPLOYEES_GROUP,
  MANUFACTURING_NAV_ITEM,
  COPILOT_NAV_ITEM,
  POS_NAV_ITEM,
  type NavGroup,
  type NavLeaf,
  type NavFlatItem,
} from "@/components/app-shell/nav-config";

export const MOVABLE_GROUPS: NavGroup[] = [ORDERS_GROUP, REPORTS_GROUP, EXPENSES_GROUP, SALES_GROUP, INVENTORY_GROUP, PURCHASES_GROUP, EMPLOYEES_GROUP, SETTINGS_GROUP];

const GROUP_BY_ID = new Map(MOVABLE_GROUPS.map((g) => [g.id, g]));
export function getGroup(groupId: string): NavGroup | undefined {
  return GROUP_BY_ID.get(groupId);
}

/** Everything the sidebar can place at the root level, in its built-in default order.
 *  The Stitching Orders group is spliced in right after Board — where the flat "Stitching
 *  Orders" link used to live — rather than spread from PRIMARY_NAV, since PRIMARY_NAV no
 *  longer contains it (it's now ORDERS_GROUP, see nav-config.ts). */
const ROOT_DEFAULTS: { id: string; kind: "flat" | "group" }[] = [
  { id: "/dashboard", kind: "flat" as const },
  { id: "/orders?view=board", kind: "flat" as const },
  { id: `group:${ORDERS_GROUP.id}`, kind: "group" as const },
  { id: "/orders?type=alteration", kind: "flat" as const },
  { id: "/crm", kind: "flat" as const },
  { id: `group:${REPORTS_GROUP.id}`, kind: "group" as const },
  { id: `group:${EXPENSES_GROUP.id}`, kind: "group" as const },
  ...SECONDARY_NAV.map((i) => ({ id: i.href, kind: "flat" as const })),
  { id: `group:${SALES_GROUP.id}`, kind: "group" as const },
  { id: `group:${INVENTORY_GROUP.id}`, kind: "group" as const },
  { id: `group:${PURCHASES_GROUP.id}`, kind: "group" as const },
  { id: MANUFACTURING_NAV_ITEM.href, kind: "flat" as const },
  { id: POS_NAV_ITEM.href, kind: "flat" as const },
  { id: `group:${EMPLOYEES_GROUP.id}`, kind: "group" as const },
  { id: COPILOT_NAV_ITEM.href, kind: "flat" as const },
  { id: `group:${SETTINGS_GROUP.id}`, kind: "group" as const },
];
const ROOT_DEFAULT_IDS = ROOT_DEFAULTS.map((n) => n.id);

const FLAT_ITEM_BY_HREF = new Map<string, NavFlatItem>([...PRIMARY_NAV, ...SECONDARY_NAV, MANUFACTURING_NAV_ITEM, COPILOT_NAV_ITEM, POS_NAV_ITEM].map((i) => [i.href, i]));

export function findLeafAnywhere(href: string): NavLeaf | undefined {
  for (const g of MOVABLE_GROUPS) {
    const l = g.children.find((c) => c.href === href);
    if (l) return l;
  }
  return undefined;
}

export interface RootMeta {
  label: string;
  icon: LucideIcon;
}

/** Label/icon for a root id (flat href or `group:<id>`) — for the admin editor, which doesn't otherwise know what an id refers to. */
export function getRootMeta(id: string): RootMeta | undefined {
  if (id.startsWith("group:")) {
    const group = GROUP_BY_ID.get(id.slice("group:".length));
    return group ? { label: group.label, icon: group.icon } : undefined;
  }
  const flat = FLAT_ITEM_BY_HREF.get(id);
  return flat ? { label: flat.label, icon: flat.icon } : undefined;
}

export interface NavLayoutSetting {
  /** Ordered root-level ids (flat hrefs and `group:<id>` group markers). */
  rootOrder: string[];
  /** Root ids currently hidden (kept in rootOrder so un-hiding restores position). */
  hiddenRoot: string[];
  /** groupId -> full, ordered list of hrefs currently assigned to that group (the whole truth, not a diff). */
  groupChildren: Record<string, string[]>;
  /** Leaf hrefs hidden within whichever group they're in. */
  hiddenLeaves: string[];
}

export const DEFAULT_NAV_LAYOUT: NavLayoutSetting = {
  rootOrder: ROOT_DEFAULT_IDS,
  hiddenRoot: [],
  groupChildren: Object.fromEntries(MOVABLE_GROUPS.map((g) => [g.id, g.children.map((l) => l.href)])),
  hiddenLeaves: [],
};

/** Full root order including hidden ids (admin editor needs to show/reorder hidden items too). */
export function mergeRootOrder(saved: string[] | undefined): string[] {
  const savedList = (saved || []).filter((id) => ROOT_DEFAULT_IDS.includes(id));
  const missing = ROOT_DEFAULT_IDS.filter((id) => !savedList.includes(id));
  return [...savedList, ...missing];
}

/** Full current group membership: saved arrays are the truth; anything never mentioned anywhere lands in its default group. */
export function resolveGroupChildren(saved: Record<string, string[]> | undefined): Record<string, string[]> {
  const savedGroupChildren = saved || {};
  const mentioned = new Set(Object.values(savedGroupChildren).flat());
  const result: Record<string, string[]> = {};
  MOVABLE_GROUPS.forEach((g) => {
    const existing = (savedGroupChildren[g.id] || []).filter((href) => findLeafAnywhere(href));
    const freshDefaults = g.children.filter((l) => !mentioned.has(l.href)).map((l) => l.href);
    result[g.id] = [...existing, ...freshDefaults];
  });
  return result;
}

/** Resolves a saved layout (merged with current NAV_CONFIG) into what the sidebar should actually render. */
export function resolveNavLayout(saved: NavLayoutSetting | null | undefined) {
  const rootOrder = mergeRootOrder(saved?.rootOrder);
  const hiddenRoot = new Set(saved?.hiddenRoot || []);
  const hiddenLeaves = new Set(saved?.hiddenLeaves || []);
  const groupChildren = resolveGroupChildren(saved?.groupChildren);
  const leafByHref = new Map<string, NavLeaf>();
  MOVABLE_GROUPS.forEach((g) => g.children.forEach((l) => leafByHref.set(l.href, l)));

  const roots = rootOrder
    .filter((id) => !hiddenRoot.has(id))
    .map((id) => {
      if (id.startsWith("group:")) {
        const groupId = id.slice("group:".length);
        const group = GROUP_BY_ID.get(groupId);
        if (!group) return null;
        const children = groupChildren[groupId]
          .filter((href) => !hiddenLeaves.has(href))
          .map((href) => leafByHref.get(href))
          .filter((l): l is NavLeaf => !!l);
        return { kind: "group" as const, group, children };
      }
      const flat = FLAT_ITEM_BY_HREF.get(id);
      if (!flat) return null;
      return { kind: "flat" as const, item: flat };
    })
    .filter((n): n is NonNullable<typeof n> => !!n);

  return { roots };
}

export interface EditableLeaf {
  leaf: NavLeaf;
  groupId: string;
  hidden: boolean;
}

/** Every leaf across the six movable groups, grouped and ordered per the resolved layout — feeds the admin editor. */
export function getEditableLeaves(saved: NavLayoutSetting | null | undefined): EditableLeaf[] {
  const hiddenLeaves = new Set(saved?.hiddenLeaves || []);
  const groupChildren = resolveGroupChildren(saved?.groupChildren);
  const out: EditableLeaf[] = [];
  MOVABLE_GROUPS.forEach((g) => {
    groupChildren[g.id].forEach((href) => {
      const leaf = findLeafAnywhere(href);
      if (leaf) out.push({ leaf, groupId: g.id, hidden: hiddenLeaves.has(href) });
    });
  });
  return out;
}
