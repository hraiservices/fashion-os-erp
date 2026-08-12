// Platform-level module licensing — decides what EXISTS in a given deployment at all, set once
// per customer by the platform super-admin (see src/hooks/use-current-user.ts `isSuperAdmin`).
// This is a separate concern from src/lib/permissions.ts, which governs what a logged-in user's
// ROLE can do within a deployment that already has a module. A module being licensed off hides
// it for every role, including admin.
//
// Storage: a single `moduleEntitlements` app_settings row (see src/hooks/use-module-entitlements.ts).
// Missing keys default to enabled — an existing deployment with no row yet, or an old saved
// value missing a newly-added module/report/widget key, behaves exactly as before this feature
// shipped (opt-out, not opt-in), mirroring the shallow-merge default pattern of useAppSetting.

export type ModuleId = "inventory" | "purchases" | "sales" | "employees" | "expenses" | "pos" | "copilot" | "reports";

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  description: string;
}

export const MODULE_CATALOG: ModuleMeta[] = [
  { id: "inventory", label: "Inventory", description: "Raw materials, products, stock ledger, warehouses & transfers" },
  { id: "purchases", label: "Purchases", description: "Vendors, purchase orders, bills, payments made, vendor credits" },
  { id: "sales", label: "Product Sales", description: "Quotations, invoices, recurring invoices, payments received" },
  { id: "employees", label: "Employees", description: "Staff directory, attendance, commission, payroll & salaries" },
  { id: "expenses", label: "Expenses", description: "Expense tracking and categories" },
  { id: "pos", label: "POS", description: "Point-of-sale checkout screen" },
  { id: "copilot", label: "AI Copilot", description: "AI chat assistant over the shop's data" },
  { id: "reports", label: "Reports", description: "The Reports center — individual reports are toggled separately below" },
];

export const MODULE_LABEL_BY_ID = new Map(MODULE_CATALOG.map((m) => [m.id, m.label]));

export interface BillingInfo {
  /** ISO date (yyyy-mm-dd). Null = never expires (default for existing/unconfigured deployments). Set manually (cash/bank-transfer customers) or automatically by the Razorpay webhook. */
  paidUntil: string | null;
  /** ISO timestamp of the last payment recorded, manual or webhook-driven. */
  lastPaymentAt: string | null;
  /** Set only by the Razorpay webhook once a subscription is linked. */
  razorpaySubscriptionId: string | null;
}

export interface UsageLimits {
  /** Soft cap — null = unlimited. Enforced as a non-blocking warning, never refuses the action. */
  maxOrdersPerMonth: number | null;
  maxStaffAccounts: number | null;
}

export interface ModuleEntitlements {
  modules: Record<ModuleId, boolean>;
  /** Keyed by report href (e.g. "/reports/sales"). Missing key = enabled. */
  reports: Record<string, boolean>;
  /** Keyed by BUILTIN_WIDGETS key. Missing key = enabled. */
  widgets: Record<string, boolean>;
  /** Keyed by Settings sub-page href (e.g. "/settings/tailors"). Missing key = enabled. "/settings/account" and "/settings/module-licensing" are never gate-able — see SETTINGS_ALWAYS_ENABLED. */
  settings: Record<string, boolean>;
  billing: BillingInfo;
  limits: UsageLimits;
}

export const DEFAULT_BILLING: BillingInfo = { paidUntil: null, lastPaymentAt: null, razorpaySubscriptionId: null };
export const DEFAULT_LIMITS: UsageLimits = { maxOrdersPerMonth: null, maxStaffAccounts: null };

export const DEFAULT_ENTITLEMENTS: ModuleEntitlements = {
  modules: {
    inventory: true,
    purchases: true,
    sales: true,
    employees: true,
    expenses: true,
    pos: true,
    copilot: true,
    reports: true,
  },
  reports: {},
  widgets: {},
  settings: {},
  billing: DEFAULT_BILLING,
  limits: DEFAULT_LIMITS,
};

/** Never individually gate-able, regardless of the `settings` map — Account always needs to stay reachable so a user can change their password, and Module Licensing is already restricted to the super-admin separately. */
export const SETTINGS_ALWAYS_ENABLED = ["/settings/account", "/settings/module-licensing"];

/** Maps a REPORTS_GROUP leaf's `section` to the ModuleId that gates it, or null for sections that are always core (never module-gated). */
const REPORT_SECTION_MODULE: Record<string, ModuleId | null> = {
  Summary: null,
  "Stitching Orders": null,
  Employees: "employees",
  Sales: "sales",
  Customers: null,
  Inventory: "inventory",
  Purchases: "purchases",
  Expenses: "expenses",
  Manufacturing: null,
};

/** Maps a BUILTIN_WIDGETS key to the ModuleId that gates it, or null for widgets that are always core. */
const WIDGET_MODULE: Record<string, ModuleId | null> = {
  "upcoming-deliveries": null,
  "upcoming-payments-countdown": null,
  "outstanding-balance": null,
  "total-revenue": null,
  "stitching-dues": null,
  "sales-dues": "sales",
  "total-receivable": "sales",
  "inventory-value": "inventory",
  "low-stock-items": "inventory",
  "purchases-payable": "purchases",
  "manufacturing-active": null,
  "manufacturing-cost": null,
  "revenue-flow": null,
  pipeline: null,
  "monthly-overview": null,
  "top-expenses": "expenses",
  "pending-payments": null,
  "needs-attention": null,
  "recent-orders": null,
  "tailor-load": null,
};

/** Route prefixes gated by a whole module — checked server-side in src/lib/supabase/session.ts. Reports are handled separately (per-leaf, not by prefix) since they cascade off a `section`, not a single module. */
export const ROUTE_MODULE_PREFIXES: Record<string, ModuleId> = {
  "/inventory": "inventory",
  "/purchases": "purchases",
  "/sales": "sales",
  "/employees": "employees",
  "/expenses": "expenses",
  "/pos": "pos",
  "/copilot": "copilot",
};

export function isModuleEnabled(ent: ModuleEntitlements, id: ModuleId): boolean {
  return ent.modules[id] !== false;
}

/** A report needs the Reports module itself on, its owning module (if any) on, and its own flag not explicitly off. */
export function isReportEnabled(ent: ModuleEntitlements, href: string, section: string | undefined): boolean {
  if (!isModuleEnabled(ent, "reports")) return false;
  const owningModule = section ? REPORT_SECTION_MODULE[section] : null;
  if (owningModule && !isModuleEnabled(ent, owningModule)) return false;
  return ent.reports[href] !== false;
}

/** A widget needs its owning module (if any) on and its own flag not explicitly off. Not gated by the "reports" module — dashboard widgets are a separate surface. */
export function isWidgetEnabled(ent: ModuleEntitlements, key: string): boolean {
  const owningModule = WIDGET_MODULE[key];
  if (owningModule && !isModuleEnabled(ent, owningModule)) return false;
  return ent.widgets[key] !== false;
}

export function reportOwningModule(section: string | undefined): ModuleId | null {
  return section ? REPORT_SECTION_MODULE[section] ?? null : null;
}

export function widgetOwningModule(key: string): ModuleId | null {
  return WIDGET_MODULE[key] ?? null;
}

export function isSettingEnabled(ent: ModuleEntitlements, href: string): boolean {
  if (SETTINGS_ALWAYS_ENABLED.includes(href)) return true;
  return ent.settings[href] !== false;
}

/** Unset paidUntil = never expires (default for a deployment that hasn't configured billing). */
export function isLicenseExpired(ent: ModuleEntitlements): boolean {
  const paidUntil = ent.billing?.paidUntil;
  if (!paidUntil) return false;
  return new Date(paidUntil + "T23:59:59") < new Date();
}

/** Null when there's no expiry date set at all. Negative once past the date. */
export function daysUntilExpiry(ent: ModuleEntitlements): number | null {
  const paidUntil = ent.billing?.paidUntil;
  if (!paidUntil) return null;
  const ms = new Date(paidUntil + "T23:59:59").getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
