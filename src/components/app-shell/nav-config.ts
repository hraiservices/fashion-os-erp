import {
  LayoutDashboard,
  KanbanSquare,
  Receipt,
  Users,
  BarChart3,
  History,
  Calculator,
  Settings,
  Wallet,
  Package,
  Truck,
  Factory,
  ShoppingCart,
  Sparkles,
  Scissors,
  UserCog,
  ScanBarcode,
  FileText,
  type LucideIcon,
} from "lucide-react";

export interface NavLeaf {
  href: string;
  label: string;
  /** Deep-links straight to that module's create flow — powers the sidebar's "+" quick-add icon. */
  newHref?: string;
  /** When set, a small section header is rendered above this leaf whenever it differs from the previous leaf's section — groups a flat children list into categories without changing the data shape. */
  section?: string;
  /** Profit/margin reports — restricted to the admin role specifically, not just viewReports
   *  (which managers also hold). Hidden from the Reports index/sidebar entirely for non-admins;
   *  the destination page enforces the same check independently in case of a direct link. */
  adminOnly?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
  /** When set, the group's own label is a link to this page (its landing/index), separate from the expand/collapse chevron. */
  indexHref?: string;
}

export interface NavFlatItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from restricted roles (tailor/sales) — mirrors _RESTRICTED_TABS. */
  restricted?: boolean;
  /** Deep-links straight to that module's create flow — powers the sidebar's "+" quick-add icon. */
  newHref?: string;
}

export const PRIMARY_NAV: NavFlatItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, restricted: true },
  { href: "/orders?view=board", label: "Board", icon: KanbanSquare },
  { href: "/orders?type=alteration", label: "Alterations", icon: Scissors, newHref: "/orders/new?type=alteration" },
  { href: "/crm", label: "Customers", icon: Users, restricted: true, newHref: "/crm/new" },
];

/** Stitching Orders as a dropdown: the order list itself plus the measurement search tool. */
export const ORDERS_GROUP: NavGroup = {
  id: "orders",
  label: "Stitching Orders",
  icon: Receipt,
  children: [
    { href: "/orders?view=list", label: "All Orders", newHref: "/orders/new" },
    { href: "/orders/measurements", label: "Search Measurement" },
    { href: "/settings/rates", label: "Rate Card" },
    { href: "/settings/measurements", label: "Measurements" },
    { href: "/settings/expense-categories", label: "Stitching Expense Categories" },
  ],
};

/** Rate Card / Measurements / Expense Categories are shop-config pages, gated the same as when
 *  they lived under Settings — everyone can see the order list/measurement search, but only a
 *  non-restricted user should see the config links (the pages themselves also enforce this via
 *  SettingsGuard). */
export function ordersLeafVisible(href: string, canManageShop: boolean): boolean {
  if (href === "/settings/rates" || href === "/settings/measurements" || href === "/settings/expense-categories") return canManageShop;
  return true;
}

export const REPORTS_GROUP: NavGroup = {
  id: "reports",
  label: "Reports",
  icon: BarChart3,
  indexHref: "/reports",
  children: [
    { href: "/reports/day-book", label: "Day Book", section: "Summary" },
    { href: "/reports/combined-pl", label: "Combined P&L", adminOnly: true },
    { href: "/reports/payments-received", label: "Payments Received" },

    { href: "/reports/monthly", label: "Stitching Monthly P&L", section: "Stitching Orders" },
    { href: "/reports/payment-collection", label: "Payment Collection" },
    { href: "/reports/custom-garment-rev", label: "Custom Garment Rev" },
    { href: "/reports/garments", label: "Garment Analysis" },
    { href: "/reports/seasonal-trends", label: "Seasonal Trends" },
    { href: "/reports/tailors", label: "Tailor Performance" },
    { href: "/reports/staff-efficiency", label: "Staff Efficiency" },
    { href: "/reports/tailor-workload", label: "Tailor Workload" },
    { href: "/reports/tailor-worksheet", label: "Daily Tailor Worksheet" },
    { href: "/reports/aging", label: "Balance Aging" },
    { href: "/reports/pending-orders", label: "Pending Orders" },
    { href: "/reports/ready-uncollected", label: "Ready & Uncollected" },
    { href: "/reports/rework-rate", label: "Rework Rate" },
    { href: "/reports/deposit-compliance", label: "Deposit Compliance" },
    { href: "/reports/order-profitability", label: "Order Profitability", adminOnly: true },
    { href: "/reports/booking-sources", label: "Booking Sources" },
    { href: "/reports/reorder-candidates", label: "Reorder Candidates" },
    { href: "/reports/top-referrers", label: "Top Referrers" },

    { href: "/reports/employees", label: "Employee Directory", section: "Employees" },
    { href: "/reports/attendance-summary", label: "Attendance Summary" },
    { href: "/reports/employee-commission", label: "Employee Commission" },
    { href: "/reports/payroll-summary", label: "Salary Report" },
    { href: "/reports/tailor-payables", label: "Tailor Payables" },

    { href: "/reports/sales", label: "Sales Summary", section: "Sales" },
    { href: "/reports/sales/by-customer", label: "Sales by Customer" },
    { href: "/reports/sales/by-item", label: "Sales by Item" },
    { href: "/reports/sales/profit-by-item", label: "Profit by Item", adminOnly: true },
    { href: "/sales/payments", label: "Payments Received" },
    { href: "/reports/sales/time-to-get-paid", label: "Time to Get Paid" },
    { href: "/reports/sales/credit-notes", label: "Credit Note Details" },
    { href: "/reports/gst-summary", label: "GST Summary" },
    { href: "/reports/payment-methods", label: "Payment Methods" },

    { href: "/reports/customer-balances", label: "Customer Balances", section: "Customers" },
    { href: "/reports/customers", label: "Customer Lifetime" },
    { href: "/reports/loyalty-impact", label: "Loyalty Impact" },
    { href: "/reports/recommendations", label: "Recommendation Performance" },

    { href: "/reports/inventory", label: "Inventory", section: "Inventory" },

    { href: "/reports/purchases", label: "Payable Summary", section: "Purchases" },
    { href: "/reports/payables/vendor-balance-summary", label: "Vendor Balance Summary" },
    { href: "/reports/payables/aging-summary", label: "AP Aging Summary" },
    { href: "/reports/payables/aging-details", label: "AP Aging Details" },
    { href: "/reports/payables/payable-details", label: "Payable Details" },
    { href: "/purchases/bills", label: "Bill Details" },
    { href: "/reports/payables/vendor-credits", label: "Vendor Credit Details" },
    { href: "/purchases/payments", label: "Payments Made" },
    { href: "/purchases/orders", label: "Purchase Order Details" },
    { href: "/reports/payables/po-by-vendor", label: "Purchase Orders by Vendor" },
    { href: "/reports/payables/po-by-item", label: "Purchase Order By Item" },

    { href: "/reports/expenses/details", label: "Expense Details", section: "Expenses" },
    { href: "/reports/expenses/by-category", label: "Expenses by Category" },
    { href: "/reports/expenses/by-employee", label: "Expenses by Employee" },

    { href: "/reports/manufacturing", label: "Manufacturing", section: "Manufacturing" },
  ],
};

/** Resolves the effective section for a REPORTS_GROUP leaf, filling forward from the last `section`-tagged leaf — mirrors how the sidebar/Reports index visually group unlabeled leaves under the preceding section header. Needed anywhere a single leaf's conceptual category matters (module-licensing cascade), not just the sequential render. */
export function resolveReportSection(href: string): string | undefined {
  let category: string | undefined;
  for (const leaf of REPORTS_GROUP.children) {
    if (leaf.section) category = leaf.section;
    if (leaf.href === href) return category;
  }
  return undefined;
}

export const INVENTORY_GROUP: NavGroup = {
  id: "inventory",
  label: "Inventory",
  icon: Package,
  children: [
    { href: "/inventory", label: "Overview" },
    { href: "/inventory/raw-materials", label: "Raw Materials", newHref: "/inventory/raw-materials?new=1" },
    { href: "/inventory/products", label: "Products", newHref: "/inventory/products?new=1" },
    { href: "/inventory/adjustments", label: "Adjustments" },
    { href: "/inventory/warehouses", label: "Warehouses" },
    { href: "/inventory/stock-transfer", label: "Stock Transfer" },
  ],
};

export const PURCHASES_GROUP: NavGroup = {
  id: "purchases",
  label: "Purchases",
  icon: Truck,
  children: [
    { href: "/purchases/vendors", label: "Vendors", newHref: "/purchases/vendors?new=1" },
    { href: "/purchases/orders", label: "Purchase Orders", newHref: "/purchases/orders/new" },
    { href: "/purchases/bills", label: "Bills", newHref: "/purchases/bills/new" },
    { href: "/purchases/payments", label: "Payments Made" },
    { href: "/purchases/vendor-credits", label: "Vendor Credits" },
  ],
};

/** Single link, not a group — tailors need this visible too, so it's rendered outside the restricted-only block. */
export const MANUFACTURING_NAV_ITEM: NavFlatItem = { href: "/manufacturing", label: "Manufacturing", icon: Factory, newHref: "/manufacturing/new" };

/** Admin/Manager only — gated on user.perms.useChatbot in nav-content.tsx, not a role-restriction list. */
export const COPILOT_NAV_ITEM: NavFlatItem = { href: "/copilot", label: "AI Copilot", icon: Sparkles };

/** Gated on user.perms.usePOS in nav-content.tsx. */
export const POS_NAV_ITEM: NavFlatItem = { href: "/pos", label: "POS", icon: ScanBarcode };

/** Also lives under Reports (nested), but surfaced here too as a top-level shortcut since it's
 *  cross-module and used often. Gated on user.perms.viewReports in nav-content.tsx. */
export const PAYMENTS_RECEIVED_NAV_ITEM: NavFlatItem = { href: "/reports/payments-received", label: "Payments Received", icon: Wallet };

export const EMPLOYEES_GROUP: NavGroup = {
  id: "employees",
  label: "Employees",
  icon: UserCog,
  children: [
    { href: "/employees", label: "All Employees", newHref: "/employees/new" },
    { href: "/employees/attendance", label: "Attendance" },
    { href: "/employees/leave", label: "Leave" },
    { href: "/employees/payroll", label: "Payroll" },
    { href: "/settings/attendance-payroll", label: "Attendance & Payroll Settings" },
    { href: "/settings/leave-policy", label: "Leave Policy" },
    { href: "/settings/tailor-rates", label: "Tailor Payable Rates" },
    { href: "/settings/users", label: "Users & Roles" },
  ],
};

export const SALES_GROUP: NavGroup = {
  id: "sales",
  label: "Product Sales",
  icon: ShoppingCart,
  children: [
    { href: "/sales/quotations", label: "Quotations", newHref: "/sales/quotations/new" },
    { href: "/sales/invoices", label: "Invoices", newHref: "/sales/invoices/new" },
    { href: "/sales/recurring-invoices", label: "Recurring Invoices", newHref: "/sales/recurring-invoices/new" },
    { href: "/sales/payments", label: "Payments Received" },
  ],
};

export const EXPENSES_GROUP: NavGroup = {
  id: "expenses",
  label: "Expenses",
  icon: Wallet,
  indexHref: "/expenses",
  children: [
    { href: "/expenses", label: "All Expenses", newHref: "/expenses?new=1" },
    { href: "/expenses/categories", label: "Categories" },
  ],
};

export const SECONDARY_NAV: NavFlatItem[] = [
  { href: "/activity-log", label: "Activity Log", icon: History, restricted: true },
  { href: "/cost-estimator", label: "Cost Estimator", icon: Calculator, restricted: true, newHref: "/cost-estimator/new" },
];

export const SETTINGS_GROUP: NavGroup = {
  id: "settings",
  label: "Settings",
  icon: Settings,
  children: [
    { href: "/settings/personalize", label: "Personalize" },
    { href: "/settings/whatsapp", label: "WhatsApp" },
    { href: "/settings/loyalty", label: "Loyalty" },
    { href: "/settings/invoice-terms", label: "Invoice Terms" },
    { href: "/settings/invoice-template", label: "Invoice Template" },
    { href: "/settings/price-lists", label: "Price Lists" },
    { href: "/settings/copilot", label: "AI Copilot" },
    { href: "/settings/navigation", label: "Sidebar Navigation" },
    { href: "/settings/module-licensing", label: "Module Licensing" },
  ],
};

/** The policy/config leaves living under Employees stay admin-only, same as when they lived
 *  under Settings — everyone with manageEmployees can see Attendance/Leave/Payroll data, but
 *  only an admin should see the policy config links and Users & Roles (the pages themselves
 *  also enforce this via SettingsGuard). */
export function employeesLeafVisible(href: string, isAdmin: boolean): boolean {
  if (
    href === "/settings/attendance-payroll" ||
    href === "/settings/leave-policy" ||
    href === "/settings/tailor-rates" ||
    href === "/settings/users"
  )
    return isAdmin;
  return true;
}

/** Per-section Settings gating, mirroring the old app's rules. Module Licensing is platform-owner-only — invisible to every shop's own admin, including "admin" role. Personalize merges Shop Profile/Account/Appearance/Document Numbering onto one page, so it stays visible to everyone the same way Account did — the page itself hides the admin/manager-only sections inline. */
export function settingsLeafVisible(href: string, isAdmin: boolean, canManageShop: boolean, isSuperAdmin: boolean): boolean {
  if (href === "/settings/module-licensing") return isSuperAdmin;
  if (
    ["/settings/whatsapp", "/settings/loyalty", "/settings/invoice-terms", "/settings/invoice-template", "/settings/price-lists", "/settings/copilot", "/settings/navigation"].includes(
      href,
    )
  )
    return isAdmin;
  return true; // /settings/personalize and /settings/account — everyone (canManageShop kept as a param for callers/backward compat)
}

/** Bottom tab bar on mobile for admin/manager (unrestricted) logins — sits left of the centre
 *  "+"; MOBILE_TABS_ADMIN_RIGHT sits right of it. Support/WhatsApp and AI Copilot are NOT here
 *  for this role — they live in the hamburger side drawer instead (NavContent), since an
 *  admin/manager already has a full set of nav destinations competing for the bar's limited
 *  space. */
export const MOBILE_TABS_ADMIN_LEFT: NavFlatItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/orders?view=list", label: "Orders", icon: Receipt },
  { href: "/orders?view=board", label: "Board", icon: KanbanSquare },
];

export const MOBILE_TABS_ADMIN_RIGHT: NavFlatItem[] = [
  { href: "/crm", label: "Clients", icon: Users },
  { href: "/sales/invoices", label: "Invoices", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

/** Bottom tab bar on mobile for tailor/sales (restricted) logins — day-to-day work is just
 *  Orders/Board, so Support and Copilot (rendered separately in MobileTabBar, not part of this
 *  list) fill the space admin/manager instead spends on Clients/Invoices/Reports. */
export const MOBILE_TABS_RESTRICTED_LEFT: NavFlatItem[] = [
  { href: "/orders?view=list", label: "Orders", icon: Receipt },
  { href: "/orders?view=board", label: "Board", icon: KanbanSquare },
];
