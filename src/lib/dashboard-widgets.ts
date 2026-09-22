// Builtin dashboard widget registry + per-user layout shape. Every widget — KPI tile, chart,
// or list — is addressable by a stable key so a user's visibility/order choices survive
// across sessions regardless of how the underlying section is implemented.
import type { CustomCardConfig } from "@/lib/custom-card";
import type { Role } from "@/lib/permissions";

export type WidgetSize = "sm" | "lg" | "full";

export interface BuiltinWidgetMeta {
  key: string;
  title: string;
  size: WidgetSize;
  description: string;
  /** Where clicking the card body navigates. */
  href?: string;
}

export const BUILTIN_WIDGETS: BuiltinWidgetMeta[] = [
  { key: "upcoming-deliveries",         title: "Delivery Countdown",   size: "lg",   href: "/orders?view=board",     description: "Live days:hours:minutes:seconds countdown for the next 10 customers by delivery deadline" },
  { key: "upcoming-payments-countdown", title: "Payment Countdown",    size: "lg",   href: "/reports/aging",         description: "Live days:hours:minutes:seconds countdown for the next 10 customers by overdue/upcoming payment" },
  { key: "outstanding-balance",         title: "Outstanding Balance",  size: "lg",   href: "/reports/aging",         description: "Stitching balance due, current vs overdue" },
  { key: "total-revenue",               title: "Total Revenue",        size: "lg",   href: "/reports/monthly",       description: "All-time billed vs collected (stitching)" },
  { key: "stitching-dues",              title: "Stitching Dues",       size: "sm",   href: "/orders",                description: "Outstanding balance on stitching orders" },
  { key: "sales-dues",                  title: "Product Sales Dues",   size: "sm",   href: "/sales/invoices",        description: "Outstanding balance on product sales invoices" },
  { key: "total-receivable",            title: "Total Receivable",     size: "sm",   href: "/reports/aging",         description: "Stitching Orders + Product Sales dues combined" },
  { key: "inventory-value",             title: "Inventory Value",      size: "sm",   href: "/inventory",             description: "Raw material + finished goods stock value" },
  { key: "low-stock-items",             title: "Low Stock Items",      size: "sm",   href: "/inventory",             description: "Items at or below their alert threshold" },
  { key: "purchases-payable",           title: "Purchases Payable",    size: "sm",   href: "/purchases",             description: "Outstanding amount owed to vendors" },
  { key: "manufacturing-active",        title: "Active Work Orders",   size: "sm",   href: "/manufacturing",         description: "Work orders not yet completed" },
  { key: "manufacturing-cost",          title: "Production Cost",      size: "sm",   href: "/manufacturing",         description: "Total cost of completed work orders" },
  { key: "revenue-flow",                title: "Revenue Flow",         size: "lg",   href: "/reports/monthly",       description: "Billed vs collected, last 6 months" },
  { key: "pipeline",                    title: "Pipeline",             size: "lg",   href: "/orders?view=board",     description: "Orders by stage" },
  { key: "monthly-overview",            title: "Monthly Overview",     size: "lg",   href: "/reports/monthly",       description: "Billed vs collected bar chart" },
  { key: "top-expenses",                title: "Top Expenses",         size: "lg",   href: "/expenses",              description: "Expense breakdown by category" },
  { key: "pending-payments",            title: "Pending Payments",     size: "full", href: "/orders",                description: "Stitching orders with balance due" },
  { key: "needs-attention",             title: "Needs Attention",      size: "lg",   href: "/orders",                description: "Overdue or ready-for-pickup orders" },
  { key: "recent-orders",               title: "Recent Orders",        size: "lg",   href: "/orders",                description: "Latest stitching orders" },
  { key: "tailor-load",                 title: "Tailor Load",          size: "lg",   href: "/orders?view=board",     description: "Active orders per tailor" },
  { key: "sales-opportunities",         title: "Sales Opportunities",  size: "lg",   href: "/inventory/products",    description: "Customers who may want current stock, based on purchase history" },
  { key: "profit-overview",             title: "Profit Overview",      size: "full", href: "/reports/combined-pl",   description: "Live stitching revenue, sales revenue, costs and profit — Week/Month/6 Months. Admin & manager only." },
  { key: "pipeline-velocity",           title: "Pipeline Velocity",    size: "full", href: "/reports/tailor-workload", description: "Live average days-to-Ready and on-time % trend — Week/Month/6 Months. Admin & manager only." },
  { key: "tailor-performance",          title: "Tailor Performance",   size: "full", href: "/reports/tailor-workload", description: "Live per-tailor revenue, order count and rework count leaderboard — Week/Month/6 Months. Admin & manager only." },
  { key: "live-report",                 title: "LIVE Report",          size: "full", href: "/reports/live",          description: "Orders ready but not picked up, and orders picked up but not paid, with a one-tap WhatsApp reminder" },
];

export const BUILTIN_WIDGET_BY_KEY = new Map(BUILTIN_WIDGETS.map((w) => [w.key, w]));

/** Builtin widgets visible only to specific roles — everything else is visible to any role that
 *  can reach the dashboard at all (there's no per-role restriction otherwise; entitlements
 *  gate by module, not role). Checked at render time in the dashboard page, not baked into
 *  BUILTIN_WIDGETS itself, so a role change takes effect without touching anyone's saved layout. */
const WIDGET_ROLE_RESTRICTIONS: Record<string, Role[]> = {
  "profit-overview": ["admin", "manager"],
  "pipeline-velocity": ["admin", "manager"],
  "tailor-performance": ["admin", "manager"],
};

export function isWidgetVisibleForRole(builtinKey: string | undefined, role: string | undefined): boolean {
  if (!builtinKey) return true;
  const allowed = WIDGET_ROLE_RESTRICTIONS[builtinKey];
  return !allowed || (!!role && allowed.includes(role as Role));
}

export interface WidgetInstance {
  /** Stable across renders — the builtin key, or `custom-<random>` for user-built cards. */
  id: string;
  kind: "builtin" | "custom";
  builtinKey?: string;
  customConfig?: CustomCardConfig;
  visible: boolean;
  order: number;
  /** Width in grid columns (1–4). Absent = use the builtin default. */
  colSpan?: 1 | 2 | 3 | 4;
  /** Height in pixels. Absent = natural content height. */
  heightPx?: number;
}

export function defaultLayout(): WidgetInstance[] {
  return BUILTIN_WIDGETS.map((w, i) => ({ id: w.key, kind: "builtin", builtinKey: w.key, visible: true, order: i }));
}

/** Merges a saved layout with any newly-added builtin widgets so upgrades never lose or hide new cards silently — new ones just append, visible by default. */
export function reconcileLayout(saved: WidgetInstance[]): WidgetInstance[] {
  const knownIds = new Set(saved.map((w) => w.id));
  const missing = BUILTIN_WIDGETS.filter((w) => !knownIds.has(w.key)).map((w, i) => ({
    id: w.key,
    kind: "builtin" as const,
    builtinKey: w.key,
    visible: true,
    order: saved.length + i,
  }));
  return [...saved, ...missing];
}

export function genCustomWidgetId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
