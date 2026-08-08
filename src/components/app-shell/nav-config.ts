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
  type LucideIcon,
} from "lucide-react";

export interface NavLeaf {
  href: string;
  label: string;
  /** Deep-links straight to that module's create flow — powers the sidebar's "+" quick-add icon. */
  newHref?: string;
  /** When set, a small section header is rendered above this leaf whenever it differs from the previous leaf's section — groups a flat children list into categories without changing the data shape. */
  section?: string;
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
  { href: "/orders", label: "Stitching Orders", icon: Receipt, newHref: "/orders/new" },
  { href: "/orders?type=alteration", label: "Alterations", icon: Scissors, newHref: "/orders/new?type=alteration" },
  { href: "/crm", label: "Customers", icon: Users, restricted: true, newHref: "/crm/new" },
];

export const REPORTS_GROUP: NavGroup = {
  id: "reports",
  label: "Reports",
  icon: BarChart3,
  indexHref: "/reports",
  children: [
    { href: "/reports/combined-pl", label: "Combined P&L", section: "Summary" },

    { href: "/reports/monthly", label: "Monthly P&L", section: "Stitching Orders" },
    { href: "/reports/payment-collection", label: "Payment Collection" },
    { href: "/reports/custom-garment-rev", label: "Custom Garment Rev" },
    { href: "/reports/garments", label: "Garment Analysis" },
    { href: "/reports/seasonal-trends", label: "Seasonal Trends" },
    { href: "/reports/tailors", label: "Tailor Performance" },
    { href: "/reports/staff-efficiency", label: "Staff Efficiency" },
    { href: "/reports/tailor-workload", label: "Tailor Workload" },
    { href: "/reports/aging", label: "Balance Aging" },
    { href: "/reports/pending-orders", label: "Pending Orders" },

    { href: "/reports/employees", label: "Employee Directory", section: "Employees" },
    { href: "/reports/attendance-summary", label: "Attendance Summary" },
    { href: "/reports/employee-commission", label: "Employee Commission" },
    { href: "/reports/payroll-summary", label: "Salary Report" },

    { href: "/reports/sales", label: "Sales Summary", section: "Sales" },
    { href: "/reports/sales/by-customer", label: "Sales by Customer" },
    { href: "/reports/sales/by-item", label: "Sales by Item" },
    { href: "/reports/sales/profit-by-item", label: "Profit by Item" },
    { href: "/sales/payments", label: "Payments Received" },
    { href: "/reports/sales/time-to-get-paid", label: "Time to Get Paid" },
    { href: "/reports/sales/credit-notes", label: "Credit Note Details" },
    { href: "/reports/gst-summary", label: "GST Summary" },
    { href: "/reports/payment-methods", label: "Payment Methods" },

    { href: "/reports/customer-balances", label: "Customer Balances", section: "Customers" },
    { href: "/reports/customers", label: "Customer Lifetime" },
    { href: "/reports/loyalty-impact", label: "Loyalty Impact" },

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

export const INVENTORY_GROUP: NavGroup = {
  id: "inventory",
  label: "Inventory",
  icon: Package,
  children: [
    { href: "/inventory", label: "Overview" },
    { href: "/inventory/raw-materials", label: "Raw Materials", newHref: "/inventory/raw-materials?new=1" },
    { href: "/inventory/products", label: "Products", newHref: "/inventory/products?new=1" },
    { href: "/inventory/adjustments", label: "Adjustments" },
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

export const EMPLOYEES_GROUP: NavGroup = {
  id: "employees",
  label: "Employees",
  icon: UserCog,
  children: [
    { href: "/employees", label: "All Employees", newHref: "/employees/new" },
    { href: "/employees/attendance", label: "Attendance" },
    { href: "/employees/payroll", label: "Payroll" },
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
    { href: "/settings/shop", label: "Shop Profile" },
    { href: "/settings/tailors", label: "Tailors" },
    { href: "/settings/rates", label: "Rate Card" },
    { href: "/settings/measurements", label: "Measurements" },
    { href: "/settings/account", label: "Account" },
    { href: "/settings/loyalty", label: "Loyalty" },
    { href: "/settings/whatsapp-sales", label: "WhatsApp Templates" },
    { href: "/settings/invoice-terms", label: "Invoice Terms" },
    { href: "/settings/invoice-template", label: "Invoice Template" },
    { href: "/settings/price-lists", label: "Price Lists" },
    { href: "/settings/bot", label: "Bot / AI" },
    { href: "/settings/copilot", label: "AI Copilot" },
    { href: "/settings/users", label: "Users & Roles" },
    { href: "/settings/font", label: "Appearance" },
    { href: "/settings/navigation", label: "Sidebar Navigation" },
  ],
};

/** Per-section Settings gating, mirroring the old app's rules. */
export function settingsLeafVisible(href: string, isAdmin: boolean, canManageShop: boolean): boolean {
  if (["/settings/shop", "/settings/tailors", "/settings/rates", "/settings/measurements"].includes(href)) return canManageShop;
  if (["/settings/loyalty", "/settings/whatsapp-sales", "/settings/invoice-terms", "/settings/invoice-template", "/settings/price-lists", "/settings/bot", "/settings/copilot", "/settings/users", "/settings/font", "/settings/navigation"].includes(href)) return isAdmin;
  return true; // /settings/account — everyone
}

/** Bottom tab bar on mobile. Deliberately 5 items max, thumb-reachable. */
export const MOBILE_TABS: NavFlatItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, restricted: true },
  { href: "/orders", label: "Orders", icon: Receipt },
  { href: "/orders?view=board", label: "Board", icon: KanbanSquare },
  { href: "/crm", label: "Clients", icon: Users, restricted: true },
];
