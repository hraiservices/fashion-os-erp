import { getPool } from "@/lib/chatbot/db";

/**
 * The Copilot's entire "database access" surface. Each tool below is a FIXED, hand-written,
 * parameterized SQL template against the same five read-only views the old SQL-generation
 * chatbot used (v_chatbot_orders/invoices/expenses/payments/inventory) — reviewed once, here,
 * and never touched again at question time.
 *
 * This replaces the old design where the model wrote the SQL itself. That design's actual
 * failure mode wasn't any one provider being a bad model — it's that "write correct SQL against
 * a schema you've only seen in a text description" is a much harder task than "pick the right
 * named tool and fill in its (few, typed) arguments." The model's job here is reduced to tool
 * selection + argument extraction, which is exactly what function-calling is built for — it can
 * no longer invent a wrong JOIN, wrong column, or wrong date filter, because there is no query
 * left for it to write.
 *
 * Declared as plain JSON Schema (provider-agnostic) rather than any one SDK's schema builder —
 * src/lib/chatbot/claude.ts maps these straight onto Anthropic's `input_schema` field.
 */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: "get_pending_orders",
    description:
      "Stitching orders still owing money (balance > 0), excluding fully-paid ('payment') orders. Use for 'pending orders', 'orders with balance due', 'who owes money'.",
    parameters: {
      type: "object",
      properties: {
        overdueOnly: { type: "boolean", description: "Only include orders past their delivery date (is_overdue). Default false." },
        tailor: { type: "string", description: "Filter to one tailor's name, if the question names one." },
      },
    },
  },
  {
    name: "get_aging_report",
    description:
      "Overdue orders (past delivery date, not delivered/paid), sorted by days overdue descending. Use for 'aging', 'overdue orders', 'who is late'.",
    parameters: {
      type: "object",
      properties: {
        minDaysOverdue: { type: "number", description: "Only orders overdue by at least this many days." },
      },
    },
  },
  {
    name: "get_ready_uncollected",
    description: "Orders marked 'ready' (finished, waiting for customer pickup) but not yet delivered. Use for 'ready but not picked up'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_delivered_unpaid",
    description: "Orders that were delivered to the customer but still have balance > 0 owed. Use for 'delivered but not paid', 'picked up not paid'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_revenue_summary",
    description:
      "Total billed (orders + invoices) and total collected (payments) in a date range. Use for 'revenue', 'how much business', 'collections this month'.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD (inclusive)." },
        to: { type: "string", description: "End date, YYYY-MM-DD (inclusive)." },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_payments_total",
    description: "Sum of money actually received (both stitching-order and product-sale payments) in a date range, optionally by payment method.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD (inclusive)." },
        to: { type: "string", description: "End date, YYYY-MM-DD (inclusive)." },
        method: { type: "string", description: "Filter to one payment method, e.g. 'cash', 'upi', 'card', if named." },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_invoice_status_summary",
    description: "Product-sale invoices grouped by payment_status (unpaid/partial/paid), with counts and total balance owed. Use for 'unpaid invoices', 'sales dues'.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter to one status: 'unpaid', 'partial', or 'paid'." },
      },
    },
  },
  {
    name: "get_expenses_summary",
    description: "Total shop expenses in a date range, grouped by category. Use for 'expenses', 'spending', 'top expense categories'.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD (inclusive)." },
        to: { type: "string", description: "End date, YYYY-MM-DD (inclusive)." },
        category: { type: "string", description: "Filter to one expense category, if named." },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_low_stock_items",
    description: "Products and raw materials currently at or below their low-stock alert threshold. Use for 'low stock', 'inventory alerts', 'what needs reordering'.",
    parameters: {
      type: "object",
      properties: {
        itemType: { type: "string", description: "Filter to 'product' or 'raw_material', if the question is specific." },
      },
    },
  },
  {
    name: "get_inventory_value",
    description: "Total stock quantity and item counts for products vs raw materials. Use for 'inventory value', 'how much stock do we have'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_tailor_workload",
    description: "Active (not delivered/paid) order counts per tailor, right now. Use for 'tailor workload', 'who is busy', 'orders per tailor'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_customer_orders",
    description: "All orders for one customer, matched by name or mobile number. Use whenever a question names a specific customer.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name (partial match ok) or mobile number." },
      },
      required: ["query"],
    },
  },
];

type ToolArgs = Record<string, unknown>;

function str(args: ToolArgs, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function bool(args: ToolArgs, key: string): boolean {
  return args[key] === true;
}
function num(args: ToolArgs, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

const MAX_ROWS = 200;

export async function executeTool(name: string, rawArgs: ToolArgs): Promise<unknown> {
  const args = rawArgs || {};
  switch (name) {
    case "get_pending_orders": {
      const clauses = ["status <> 'payment'", "balance > 0"];
      const params: unknown[] = [];
      if (bool(args, "overdueOnly")) clauses.push("is_overdue = true");
      const tailor = str(args, "tailor");
      if (tailor) { params.push(`%${tailor}%`); clauses.push(`tailor ILIKE $${params.length}`); }
      return query(
        `SELECT id, customer_name, customer_mobile, delivery_date, total, advance, balance, status, tailor, is_overdue, days_overdue
         FROM v_chatbot_orders WHERE ${clauses.join(" AND ")} ORDER BY delivery_date ASC LIMIT ${MAX_ROWS}`,
        params
      );
    }
    case "get_aging_report": {
      const minDays = num(args, "minDaysOverdue") ?? 0;
      return query(
        `SELECT id, customer_name, customer_mobile, delivery_date, total, balance, status, tailor, days_overdue
         FROM v_chatbot_orders WHERE is_overdue = true AND days_overdue >= $1
         ORDER BY days_overdue DESC LIMIT ${MAX_ROWS}`,
        [minDays]
      );
    }
    case "get_ready_uncollected":
      return query(
        `SELECT id, customer_name, customer_mobile, delivery_date, total, balance, tailor
         FROM v_chatbot_orders WHERE status = 'ready' ORDER BY delivery_date ASC LIMIT ${MAX_ROWS}`
      );
    case "get_delivered_unpaid":
      return query(
        `SELECT id, customer_name, customer_mobile, delivery_date, total, balance, tailor
         FROM v_chatbot_orders WHERE status = 'delivered' AND balance > 0 ORDER BY balance DESC LIMIT ${MAX_ROWS}`
      );
    case "get_revenue_summary": {
      const from = str(args, "from"), to = str(args, "to");
      if (!from || !to) throw new Error("from and to dates are required");
      const [orderTotals] = await query(
        `SELECT COALESCE(SUM(total), 0) AS billed, COUNT(*) AS order_count FROM v_chatbot_orders WHERE in_date BETWEEN $1 AND $2`,
        [from, to]
      );
      const [invoiceTotals] = await query(
        `SELECT COALESCE(SUM(total), 0) AS billed, COUNT(*) AS invoice_count FROM v_chatbot_invoices WHERE invoice_date BETWEEN $1 AND $2`,
        [from, to]
      );
      const [collected] = await query(
        `SELECT COALESCE(SUM(amount), 0) AS collected FROM v_chatbot_payments WHERE date BETWEEN $1 AND $2`,
        [from, to]
      );
      return { from, to, orders: orderTotals, invoices: invoiceTotals, collected: collected.collected };
    }
    case "get_payments_total": {
      const from = str(args, "from"), to = str(args, "to");
      if (!from || !to) throw new Error("from and to dates are required");
      const clauses = ["date BETWEEN $1 AND $2"];
      const params: unknown[] = [from, to];
      const method = str(args, "method");
      if (method) { params.push(method); clauses.push(`method ILIKE $${params.length}`); }
      const [row] = await query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS payment_count FROM v_chatbot_payments WHERE ${clauses.join(" AND ")}`,
        params
      );
      return row;
    }
    case "get_invoice_status_summary": {
      const status = str(args, "status");
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (status) { params.push(status); clauses.push(`payment_status = $${params.length}`); }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return query(
        `SELECT payment_status, COUNT(*) AS invoice_count, COALESCE(SUM(balance), 0) AS total_balance
         FROM v_chatbot_invoices ${where} GROUP BY payment_status ORDER BY payment_status`,
        params
      );
    }
    case "get_expenses_summary": {
      const from = str(args, "from"), to = str(args, "to");
      if (!from || !to) throw new Error("from and to dates are required");
      const clauses = ["date BETWEEN $1 AND $2"];
      const params: unknown[] = [from, to];
      const category = str(args, "category");
      if (category) { params.push(category); clauses.push(`category ILIKE $${params.length}`); }
      return query(
        `SELECT category, COUNT(*) AS expense_count, COALESCE(SUM(amount), 0) AS total
         FROM v_chatbot_expenses WHERE ${clauses.join(" AND ")} GROUP BY category ORDER BY total DESC LIMIT ${MAX_ROWS}`,
        params
      );
    }
    case "get_low_stock_items": {
      const clauses = ["is_low_stock = true"];
      const params: unknown[] = [];
      const itemType = str(args, "itemType");
      if (itemType) { params.push(itemType); clauses.push(`item_type = $${params.length}`); }
      return query(
        `SELECT id, item_type, name, sku, category, stock_qty, low_stock_alert
         FROM v_chatbot_inventory WHERE ${clauses.join(" AND ")} ORDER BY stock_qty ASC LIMIT ${MAX_ROWS}`,
        params
      );
    }
    case "get_inventory_value":
      return query(
        `SELECT item_type, COUNT(*) AS item_count, COALESCE(SUM(stock_qty), 0) AS total_qty
         FROM v_chatbot_inventory GROUP BY item_type`
      );
    case "get_tailor_workload":
      return query(
        `SELECT tailor, COUNT(*) AS active_orders, COALESCE(SUM(balance), 0) AS balance_due
         FROM v_chatbot_orders WHERE status NOT IN ('delivered', 'payment') AND tailor IS NOT NULL
         GROUP BY tailor ORDER BY active_orders DESC LIMIT ${MAX_ROWS}`
      );
    case "search_customer_orders": {
      const q = str(args, "query");
      if (!q) throw new Error("query is required");
      return query(
        `SELECT id, customer_name, customer_mobile, in_date, delivery_date, total, advance, balance, status, tailor
         FROM v_chatbot_orders WHERE customer_name ILIKE $1 OR customer_mobile ILIKE $1
         ORDER BY in_date DESC LIMIT ${MAX_ROWS}`,
        [`%${q}%`]
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
