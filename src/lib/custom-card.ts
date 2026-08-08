// Custom dashboard card engine — lets a user build their own KPI tile by picking a data
// source, an aggregation, and up to a few filters. Deliberately computed client-side over
// data already fetched by existing hooks (never a dynamic SQL/RPC query) — this keeps the
// feature safe (no arbitrary query execution) while still feeling like a real query builder.

export type CustomDataSourceKey = "orders" | "salesInvoices" | "purchaseBills" | "workOrders" | "rawMaterials" | "products" | "expenses" | "vendors" | "customers";

export interface FieldMeta {
  key: string;
  label: string;
  type: "number" | "string" | "date";
}

export interface DataSourceMeta {
  key: CustomDataSourceKey;
  label: string;
  fields: FieldMeta[];
  linkTo: string;
}

export const DATA_SOURCES: Record<CustomDataSourceKey, DataSourceMeta> = {
  orders: {
    key: "orders",
    label: "Stitching Orders",
    linkTo: "/orders",
    fields: [
      { key: "total", label: "Total", type: "number" },
      { key: "advance", label: "Advance", type: "number" },
      { key: "balance", label: "Balance", type: "number" },
      { key: "status", label: "Status", type: "string" },
      { key: "tailor", label: "Tailor", type: "string" },
      { key: "inDate", label: "In Date", type: "date" },
      { key: "deliveryDate", label: "Delivery Date", type: "date" },
    ],
  },
  salesInvoices: {
    key: "salesInvoices",
    label: "Sales Invoices",
    linkTo: "/sales/invoices",
    fields: [
      { key: "total", label: "Total", type: "number" },
      { key: "balance", label: "Balance", type: "number" },
      { key: "paidTotal", label: "Paid", type: "number" },
      { key: "gstType", label: "GST Type", type: "string" },
      { key: "customerName", label: "Customer", type: "string" },
      { key: "invoiceDate", label: "Invoice Date", type: "date" },
      { key: "dueDate", label: "Due Date", type: "date" },
    ],
  },
  purchaseBills: {
    key: "purchaseBills",
    label: "Purchase Bills",
    linkTo: "/purchases/bills",
    fields: [
      { key: "total", label: "Total", type: "number" },
      { key: "balance", label: "Balance", type: "number" },
      { key: "paidTotal", label: "Paid", type: "number" },
      { key: "gstType", label: "GST Type", type: "string" },
      { key: "billDate", label: "Bill Date", type: "date" },
      { key: "dueDate", label: "Due Date", type: "date" },
    ],
  },
  workOrders: {
    key: "workOrders",
    label: "Work Orders",
    linkTo: "/manufacturing",
    fields: [
      { key: "qtyToProduce", label: "Qty to Produce", type: "number" },
      { key: "totalCost", label: "Total Cost", type: "number" },
      { key: "laborCost", label: "Labor Cost", type: "number" },
      { key: "materialCost", label: "Material Cost", type: "number" },
      { key: "wastageCost", label: "Wastage Cost", type: "number" },
      { key: "status", label: "Status", type: "string" },
      { key: "tailor", label: "Tailor", type: "string" },
    ],
  },
  rawMaterials: {
    key: "rawMaterials",
    label: "Raw Materials",
    linkTo: "/inventory/raw-materials",
    fields: [
      { key: "stockQty", label: "Stock Qty", type: "number" },
      { key: "costPerUnit", label: "Cost per Unit", type: "number" },
      { key: "lowStockAlert", label: "Low Stock Alert", type: "number" },
      { key: "category", label: "Category", type: "string" },
    ],
  },
  products: {
    key: "products",
    label: "Products",
    linkTo: "/inventory/products",
    fields: [
      { key: "stockQty", label: "Stock Qty", type: "number" },
      { key: "sellingPrice", label: "Selling Price", type: "number" },
      { key: "taxRate", label: "Tax Rate", type: "number" },
      { key: "category", label: "Category", type: "string" },
    ],
  },
  expenses: {
    key: "expenses",
    label: "Expenses",
    linkTo: "/expenses",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "category", label: "Category", type: "string" },
      { key: "payMethod", label: "Pay Method", type: "string" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  vendors: {
    key: "vendors",
    label: "Vendors",
    linkTo: "/purchases/vendors",
    fields: [{ key: "state", label: "State", type: "string" }],
  },
  customers: {
    key: "customers",
    label: "Customers",
    linkTo: "/crm",
    fields: [
      { key: "loyaltyPoints", label: "Loyalty Points", type: "number" },
      { key: "totalEarned", label: "Lifetime Points Earned", type: "number" },
    ],
  },
};

export type Aggregation = "count" | "sum" | "avg" | "min" | "max";
export const AGGREGATION_LABELS: Record<Aggregation, string> = { count: "Count", sum: "Sum", avg: "Average", min: "Minimum", max: "Maximum" };

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  gte: "greater or equal",
  lt: "less than",
  lte: "less or equal",
  contains: "contains",
};

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value: string;
}

export type CardFormat = "number" | "currency";

export interface CustomCardConfig {
  title: string;
  dataSource: CustomDataSourceKey;
  aggregation: Aggregation;
  /** Required unless aggregation === "count". */
  field?: string;
  filters: FilterRule[];
  format: CardFormat;
}

function matchesFilter(row: Record<string, unknown>, rule: FilterRule): boolean {
  const raw = row[rule.field];
  switch (rule.operator) {
    case "eq":
      return String(raw ?? "").toLowerCase() === rule.value.toLowerCase();
    case "neq":
      return String(raw ?? "").toLowerCase() !== rule.value.toLowerCase();
    case "contains":
      return String(raw ?? "").toLowerCase().includes(rule.value.toLowerCase());
    case "gt":
      return Number(raw) > Number(rule.value);
    case "gte":
      return Number(raw) >= Number(rule.value);
    case "lt":
      return Number(raw) < Number(rule.value);
    case "lte":
      return Number(raw) <= Number(rule.value);
    default:
      return true;
  }
}

/** Runs a custom card's aggregation over already-fetched rows for its data source. */
export function computeCustomCardValue(config: CustomCardConfig, rows: Record<string, unknown>[]): number {
  const filtered = rows.filter((r) => config.filters.every((f) => matchesFilter(r, f)));
  if (config.aggregation === "count") return filtered.length;
  if (!config.field) return 0;
  const nums = filtered.map((r) => Number(r[config.field!]) || 0);
  if (nums.length === 0) return 0;
  switch (config.aggregation) {
    case "sum":
      return nums.reduce((s, n) => s + n, 0);
    case "avg":
      return nums.reduce((s, n) => s + n, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    default:
      return 0;
  }
}

export function blankCustomCard(): CustomCardConfig {
  return { title: "", dataSource: "orders", aggregation: "count", filters: [], format: "number" };
}
