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
  },
};

/** Groups PERMISSION_LABELS keys for a readable checklist, shown in both the role-reference
 *  table and any per-user permission override panel. */
export const PERMISSION_GROUPS: { label: string; keys: (keyof Permissions)[] }[] = [
  { label: "Orders", keys: ["addOrder", "editOrder", "deleteOrder", "changeStage", "managePayments", "editMeasurements"] },
  { label: "Customers", keys: ["manageCustomers", "deleteCustomers"] },
  { label: "Modules", keys: ["manageInventory", "managePurchases", "manageManufacturing", "manageSales"] },
  { label: "Admin", keys: ["viewReports", "manageUsers", "useChatbot"] },
];

export const ROLE_OPTIONS: [Role, string][] = [
  ["admin", "Admin"],
  ["manager", "Manager"],
  ["sales", "Sales Staff"],
  ["tailor", "Tailor"],
];

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
