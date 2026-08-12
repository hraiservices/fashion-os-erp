// Builtin dashboard widget registry + per-user layout shape. Every widget — KPI tile, chart,
// or list — is addressable by a stable key so a user's visibility/order choices survive
// across sessions regardless of how the underlying section is implemented.
import type { CustomCardConfig } from "@/lib/custom-card";

export type WidgetSize = "sm" | "lg" | "full";

export interface BuiltinWidgetMeta {
  key: string;
  title: string;
  size: WidgetSize;
  description: string;
}

export const BUILTIN_WIDGETS: BuiltinWidgetMeta[] = [
  { key: "upcoming-deliveries", title: "Delivery Countdown", size: "full", description: "Live days:hours:minutes:seconds countdown for the next 10 customers by delivery deadline" },
  { key: "upcoming-payments-countdown", title: "Payment Countdown", size: "full", description: "Live days:hours:minutes:seconds countdown for the next 10 customers by overdue/upcoming payment" },
  { key: "outstanding-balance", title: "Outstanding Balance", size: "lg", description: "Stitching balance due, current vs overdue" },
  { key: "total-revenue", title: "Total Revenue", size: "lg", description: "All-time billed vs collected (stitching)" },
  { key: "stitching-dues", title: "Stitching Dues", size: "sm", description: "Outstanding balance on stitching orders" },
  { key: "sales-dues", title: "Product Sales Dues", size: "sm", description: "Outstanding balance on product sales invoices" },
  { key: "total-receivable", title: "Total Receivable", size: "sm", description: "Stitching Orders + Product Sales dues combined" },
  { key: "inventory-value", title: "Inventory Value", size: "sm", description: "Raw material + finished goods stock value" },
  { key: "low-stock-items", title: "Low Stock Items", size: "sm", description: "Items at or below their alert threshold" },
  { key: "purchases-payable", title: "Purchases Payable", size: "sm", description: "Outstanding amount owed to vendors" },
  { key: "manufacturing-active", title: "Active Work Orders", size: "sm", description: "Work orders not yet completed" },
  { key: "manufacturing-cost", title: "Production Cost", size: "sm", description: "Total cost of completed work orders" },
  { key: "revenue-flow", title: "Revenue Flow", size: "lg", description: "Billed vs collected, last 6 months" },
  { key: "pipeline", title: "Pipeline", size: "lg", description: "Orders by stage" },
  { key: "monthly-overview", title: "Monthly Overview", size: "lg", description: "Billed vs collected bar chart" },
  { key: "top-expenses", title: "Top Expenses", size: "lg", description: "Expense breakdown by category" },
  { key: "pending-payments", title: "Pending Payments", size: "full", description: "Stitching orders with balance due" },
  { key: "needs-attention", title: "Needs Attention", size: "lg", description: "Overdue or ready-for-pickup orders" },
  { key: "recent-orders", title: "Recent Orders", size: "lg", description: "Latest stitching orders" },
  { key: "tailor-load", title: "Tailor Load", size: "lg", description: "Active orders per tailor" },
];

export const BUILTIN_WIDGET_BY_KEY = new Map(BUILTIN_WIDGETS.map((w) => [w.key, w]));

export interface WidgetInstance {
  /** Stable across renders — the builtin key, or `custom-<random>` for user-built cards. */
  id: string;
  kind: "builtin" | "custom";
  builtinKey?: string;
  customConfig?: CustomCardConfig;
  visible: boolean;
  order: number;
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
