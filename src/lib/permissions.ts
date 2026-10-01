// Ported 1:1 from Stitching_Manager_Pro_v16.html (resolvePerms / ROLE_DEFAULTS / _RESTRICTED_TABS,
// lines ~1982-2001 and ~17236-17239). Do not change the default matrix without confirming with
// the business owner — tailor/sales roles intentionally have a narrower permission set.

export type Role = "admin" | "manager" | "sales" | "tailor";

export interface Permissions {
  addOrder: boolean;
  deleteOrder: boolean;
  editOrder: boolean;
  managePayments: boolean;
  editMeasurements: boolean;
  changeStage: boolean;
  viewReports: boolean;
  manageCustomers: boolean;
  manageUsers: boolean;
  deleteCustomers: boolean;
  manageInventory: boolean;
  managePurchases: boolean;
  manageManufacturing: boolean;
  manageSales: boolean;
  useChatbot: boolean;
  manageEmployees: boolean;
  usePOS: boolean;
  /** Salary/payroll is sensitive HR data — kept separate from manageEmployees (which managers get) and admin-only by default. */
  managePayroll: boolean;
  /** Add/edit/delete expenses — previously gated only by role (!isRestrictedRole), with no way
   *  to grant or deny it independently of every other manager-level permission. */
  manageExpenses: boolean;
  /** Void/cancel/delete a sales invoice — split out from manageSales (create/edit) since
   *  destroying a financial record someone else may have relied on is a different risk level
   *  than editing one you're still working on. */
  voidSales: boolean;
  /** Issue a credit note against a sales invoice. */
  manageCreditNotes: boolean;
  /** Cancel a purchase order — split out from managePurchases for the same reason as voidSales. */
  cancelPurchases: boolean;
  /** Record a payment made to a vendor — money actually leaving the business, kept separate from
   *  managePurchases (creating/editing vendors, POs, bills). */
  payVendors: boolean;
  /** Record a stock adjustment (correcting a count) — split from manageInventory (viewing/editing
   *  product and raw-material records) since it directly changes what the ledger says is on hand. */
  adjustStock: boolean;
  /** Move stock between warehouses. */
  transferStock: boolean;
  /** Permanently delete a product/raw-material record (bulk-delete). */
  deleteInventory: boolean;
  /** Approve or reject an employee's leave request — split from manageEmployees (profile data,
   *  attendance marking) since approving time off is a distinct managerial decision. */
  approveLeave: boolean;
  /** Profit/margin reports (Combined P&L, Order Profitability, Product Sales P&L, Profit by
   *  Item) — kept separate from viewReports (every other report) since margin data is
   *  commercially sensitive in a way a stage-timing or attendance report isn't. */
  viewFinancialReports: boolean;
  /** Settings → WhatsApp (message templates, broadcast config). */
  manageWhatsappSettings: boolean;
  /** Settings → Loyalty program configuration. */
  manageLoyaltySettings: boolean;
  /** Settings → Invoice Terms / Invoice Template / Stitching Order Template — grouped together
   *  since all three are the same kind of thing (a printed/shared document's wording and layout). */
  manageDocumentTemplates: boolean;
  /** Settings → Price Lists. */
  managePriceLists: boolean;
  /** Settings → Sidebar Navigation (the admin-editable nav layout). */
  manageNavigationSettings: boolean;
  /** View the Activity Log (every write action across the app, with who/when). */
  viewActivityLog: boolean;
  /** Use the Cost Estimator tool. */
  useCostEstimator: boolean;
}

export const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  addOrder: "Add Orders",
  deleteOrder: "Delete Orders",
  editOrder: "Edit Orders",
  managePayments: "Manage Payments",
  editMeasurements: "Edit Measurements",
  changeStage: "Change Order Stage",
  viewReports: "View Reports",
  manageCustomers: "Manage Customers",
  manageUsers: "Manage Users",
  deleteCustomers: "Delete Customers",
  manageInventory: "Manage Inventory",
  managePurchases: "Manage Purchases",
  manageManufacturing: "Manage Manufacturing",
  manageSales: "Manage Product Sales",
  useChatbot: "Use AI Copilot",
  manageEmployees: "Manage Employees",
  usePOS: "Use POS",
  managePayroll: "Manage Payroll & Salaries",
  manageExpenses: "Manage Expenses",
  voidSales: "Void/Delete Invoices",
  manageCreditNotes: "Issue Credit Notes",
  cancelPurchases: "Cancel Purchase Orders",
  payVendors: "Pay Vendors",
  adjustStock: "Adjust Stock",
  transferStock: "Transfer Stock",
  deleteInventory: "Delete Inventory Items",
  approveLeave: "Approve Leave Requests",
  viewFinancialReports: "View Financial/Profit Reports",
  manageWhatsappSettings: "Settings: WhatsApp",
  manageLoyaltySettings: "Settings: Loyalty Program",
  manageDocumentTemplates: "Settings: Document Templates",
  managePriceLists: "Settings: Price Lists",
  manageNavigationSettings: "Settings: Sidebar Navigation",
  viewActivityLog: "View Activity Log",
  useCostEstimator: "Use Cost Estimator",
};

export const ROLE_DEFAULTS: Record<Role, Permissions> = {
  admin: {
    addOrder: true,
    deleteOrder: true,
    editOrder: true,
    managePayments: true,
    editMeasurements: true,
    changeStage: true,
    viewReports: true,
    manageCustomers: true,
    manageUsers: true,
    deleteCustomers: true,
    manageInventory: true,
    managePurchases: true,
    manageManufacturing: true,
    manageSales: true,
    useChatbot: true,
    manageEmployees: true,
    usePOS: true,
    managePayroll: true,
    manageExpenses: true,
    voidSales: true,
    manageCreditNotes: true,
    cancelPurchases: true,
    payVendors: true,
    adjustStock: true,
    transferStock: true,
    deleteInventory: true,
    approveLeave: true,
    viewFinancialReports: true,
    manageWhatsappSettings: true,
    manageLoyaltySettings: true,
    manageDocumentTemplates: true,
    managePriceLists: true,
    manageNavigationSettings: true,
    viewActivityLog: true,
    useCostEstimator: true,
  },
  manager: {
    addOrder: true,
    deleteOrder: false,
    editOrder: true,
    managePayments: true,
    editMeasurements: true,
    changeStage: true,
    viewReports: true,
    manageCustomers: true,
    manageUsers: false,
    deleteCustomers: false,
    manageInventory: true,
    managePurchases: true,
    manageManufacturing: true,
    manageSales: true,
    useChatbot: true,
    manageEmployees: true,
    usePOS: true,
    managePayroll: false,
    manageExpenses: true,
    voidSales: false,
    manageCreditNotes: true,
    cancelPurchases: false,
    payVendors: true,
    adjustStock: true,
    transferStock: true,
    deleteInventory: false,
    approveLeave: true,
    viewFinancialReports: false,
    manageWhatsappSettings: false,
    manageLoyaltySettings: false,
    manageDocumentTemplates: false,
    managePriceLists: false,
    manageNavigationSettings: false,
    viewActivityLog: true,
    useCostEstimator: true,
  },
  sales: {
    addOrder: true,
    deleteOrder: false,
    editOrder: true,
    managePayments: false,
    editMeasurements: true,
    changeStage: true,
    viewReports: false,
    manageCustomers: true,
    manageUsers: false,
    deleteCustomers: false,
    manageInventory: false,
    managePurchases: false,
    manageManufacturing: false,
    manageSales: true,
    useChatbot: false,
    manageEmployees: false,
    usePOS: true,
    managePayroll: false,
    manageExpenses: false,
    voidSales: false,
    manageCreditNotes: false,
    cancelPurchases: false,
    payVendors: false,
    adjustStock: false,
    transferStock: false,
    deleteInventory: false,
    approveLeave: false,
    viewFinancialReports: false,
    manageWhatsappSettings: false,
    manageLoyaltySettings: false,
    manageDocumentTemplates: false,
    managePriceLists: false,
    manageNavigationSettings: false,
    viewActivityLog: false,
    useCostEstimator: false,
  },
  tailor: {
    addOrder: false,
    deleteOrder: false,
    editOrder: false,
    managePayments: false,
    editMeasurements: false,
    changeStage: true,
    viewReports: false,
    manageCustomers: false,
    manageUsers: false,
    deleteCustomers: false,
    manageInventory: false,
    managePurchases: false,
    manageManufacturing: true,
    manageSales: false,
    useChatbot: false,
    manageEmployees: false,
    usePOS: false,
    managePayroll: false,
    manageExpenses: false,
    voidSales: false,
    manageCreditNotes: false,
    cancelPurchases: false,
    payVendors: false,
    adjustStock: false,
    transferStock: false,
    deleteInventory: false,
    approveLeave: false,
    viewFinancialReports: false,
    manageWhatsappSettings: false,
    manageLoyaltySettings: false,
    manageDocumentTemplates: false,
    managePriceLists: false,
    manageNavigationSettings: false,
    viewActivityLog: false,
    useCostEstimator: false,
  },
};

/** Groups PERMISSION_LABELS keys for a readable checklist, shown in both the role-reference
 *  table and any per-user permission override panel. */
export const PERMISSION_GROUPS: { label: string; keys: (keyof Permissions)[] }[] = [
  { label: "Orders", keys: ["addOrder", "editOrder", "deleteOrder", "changeStage", "managePayments", "editMeasurements"] },
  { label: "Customers", keys: ["manageCustomers", "deleteCustomers"] },
  { label: "Modules", keys: ["manageInventory", "adjustStock", "transferStock", "deleteInventory", "managePurchases", "cancelPurchases", "payVendors", "manageManufacturing", "manageSales", "voidSales", "manageCreditNotes", "usePOS"] },
  { label: "Expenses", keys: ["manageExpenses"] },
  { label: "Employees", keys: ["manageEmployees", "approveLeave", "managePayroll"] },
  { label: "Reports", keys: ["viewReports", "viewFinancialReports", "viewActivityLog"] },
  { label: "Settings", keys: ["manageUsers", "manageWhatsappSettings", "manageLoyaltySettings", "manageDocumentTemplates", "managePriceLists", "manageNavigationSettings"] },
  { label: "Tools", keys: ["useChatbot", "useCostEstimator"] },
];

export const ROLE_OPTIONS: [Role, string][] = [
  ["admin", "Admin"],
  ["manager", "Manager"],
  ["sales", "Sales Staff"],
  ["tailor", "Tailor"],
];

/** "admin" -> "Admin", falling back to the raw value for a role string that isn't one of the
 *  four known ones (e.g. a stale/free-typed employees.role value). */
export function roleLabelFor(role: string | null | undefined): string {
  return ROLE_OPTIONS.find(([val]) => val === role)?.[1] ?? String(role ?? "");
}

/** Shop-wide edits to a role's starting permissions — e.g. an admin unchecking "Delete Orders"
 *  for every Manager, not just one person (that's what custom_permissions on a single user_roles
 *  row is for). Stored in app_settings under "roleDefaultOverrides"; see
 *  add_role_default_overrides_lockdown.sql for why writes are routed through
 *  /api/settings/role-defaults rather than a direct app_settings upsert — this is exactly as
 *  sensitive as tailorRates (a role could otherwise grant itself more than intended). */
export type RoleDefaultOverrides = Partial<Record<Role, Partial<Permissions>>>;
export const DEFAULT_ROLE_DEFAULT_OVERRIDES: RoleDefaultOverrides = {};

export function resolvePerms(role: string, custom?: Partial<Permissions> | null, roleDefaultOverrides?: RoleDefaultOverrides | null): Permissions {
  const key = (ROLE_DEFAULTS[role as Role] ? role : "tailor") as Role;
  const base = { ...ROLE_DEFAULTS[key], ...(roleDefaultOverrides?.[key] || {}) };
  if (custom && typeof custom === "object") Object.assign(base, custom);
  return base;
}

/** Route prefixes hidden from non-admin/non-manager roles. Mirrors _RESTRICTED_TABS. */
export const RESTRICTED_ROUTE_PREFIXES = ["/dashboard", "/crm", "/reports", "/activity-log", "/cost-estimator", "/expenses", "/inventory", "/purchases"] as const;

export function isRestrictedRoute(pathname: string): boolean {
  return RESTRICTED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Only admin/manager get full access; everyone else (sales, tailor, unknown roles) is restricted. */
export function isRestrictedRole(role: string): boolean {
  const r = (role || "tailor").toLowerCase().trim();
  return !(r === "admin" || r === "manager");
}

/** Fallback landing route for a restricted role that requests a hidden path. Mirrors setTab("kanban"). */
export const RESTRICTED_FALLBACK_ROUTE = "/orders";
