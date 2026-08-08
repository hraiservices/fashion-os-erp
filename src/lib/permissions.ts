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

export function resolvePerms(role: string, custom?: Partial<Permissions> | null): Permissions {
  const key = (ROLE_DEFAULTS[role as Role] ? role : "tailor") as Role;
  const base = { ...ROLE_DEFAULTS[key] };
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
