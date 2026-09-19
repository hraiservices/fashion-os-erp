import { executeTool } from "@/lib/chatbot/tools";
import { istDateString } from "@/lib/ist-date";
import { inr } from "@/lib/format";

/**
 * Deterministic, zero-AI answer engine — kicks in only when the Claude API call itself failed
 * (no key configured, network error, rate limit, etc; see route.ts), never when Claude ran fine
 * but genuinely couldn't answer the question. No LLM involved at all here: a fixed keyword match
 * picks one of the same tools.ts queries the AI engine uses (the same real data behind the
 * Reports pages), runs it, and formats the real numbers into a plain templated sentence. This
 * can't understand phrasing outside its keyword list, but it means the Copilot still answers the
 * common questions even with zero AI configured/working, instead of a flat "not configured" error.
 */

function firstOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

interface FallbackRule {
  /** Any one of these substrings appearing in the (lowercased) question triggers this rule —
   *  first match in array order wins, so more specific rules must come before generic ones. */
  keywords: string[];
  run: (question: string) => Promise<string | null>;
}

const today = () => istDateString();

const MOBILE_RE = /\b\d{10}\b/;

const RULES: FallbackRule[] = [
  {
    // A 10-digit mobile number in the question is an unambiguous signal this is a customer
    // lookup, regardless of what else the question says — checked first, before any other rule.
    keywords: [],
    run: async (question) => {
      const match = MOBILE_RE.exec(question);
      if (!match) return null;
      const rows = (await executeTool("search_customer_orders", { query: match[0] })) as { customer_name: string; status: string; balance: number }[];
      if (!rows.length) return `No orders found for ${match[0]}.`;
      const top = rows.slice(0, 5).map((r) => `${r.status}, ${inr(r.balance)} due`);
      return `${rows.length} order${rows.length === 1 ? "" : "s"} for ${rows[0].customer_name}: ${top.join("; ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.`;
    },
  },
  {
    keywords: ["overdue", "aging", "ageing", "late order", "kaun se order", "der se"],
    run: async () => {
      const rows = (await executeTool("get_aging_report", {})) as { customer_name: string; days_overdue: number; balance: number }[];
      if (!rows.length) return "No overdue orders right now — everything is on track.";
      const top = rows.slice(0, 5).map((r) => `${r.customer_name} (${r.days_overdue}d, ${inr(r.balance)})`);
      return `${rows.length} overdue order${rows.length === 1 ? "" : "s"}: ${top.join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.`;
    },
  },
  {
    keywords: ["ready but not picked", "ready but not collect", "ready uncollected", "ready for pickup", "ready ho gaye"],
    run: async () => {
      const rows = (await executeTool("get_ready_uncollected", {})) as { customer_name: string; balance: number }[];
      if (!rows.length) return "Nothing sitting ready-but-uncollected right now.";
      const top = rows.slice(0, 5).map((r) => `${r.customer_name} (${inr(r.balance)} due)`);
      return `${rows.length} order${rows.length === 1 ? "" : "s"} ready but not picked up: ${top.join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.`;
    },
  },
  {
    keywords: ["delivered but not paid", "picked up not paid", "delivered unpaid"],
    run: async () => {
      const rows = (await executeTool("get_delivered_unpaid", {})) as { customer_name: string; balance: number }[];
      if (!rows.length) return "No delivered orders with balance still due.";
      const top = rows.slice(0, 5).map((r) => `${r.customer_name} (${inr(r.balance)})`);
      return `${rows.length} delivered order${rows.length === 1 ? "" : "s"} still unpaid: ${top.join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.`;
    },
  },
  {
    keywords: ["pending order", "pending kaam", "balance due", "orders with balance", "who owes", "kaun paisa"],
    run: async () => {
      const rows = (await executeTool("get_pending_orders", {})) as { customer_name: string; balance: number }[];
      if (!rows.length) return "No pending orders with balance due.";
      const top = rows.slice(0, 5).map((r) => `${r.customer_name} (${inr(r.balance)})`);
      return `${rows.length} pending order${rows.length === 1 ? "" : "s"}: ${top.join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.`;
    },
  },
  {
    keywords: ["low stock", "low on stock", "stock alert", "reorder", "stock khatam", "needs reordering"],
    run: async () => {
      const rows = (await executeTool("get_low_stock_items", {})) as { name: string; stock_qty: number }[];
      if (!rows.length) return "Nothing is currently at or below its low-stock alert level.";
      const top = rows.slice(0, 5).map((r) => `${r.name} (${r.stock_qty} left)`);
      return `${rows.length} item${rows.length === 1 ? "" : "s"} low on stock: ${top.join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.`;
    },
  },
  {
    keywords: ["inventory value", "how much stock", "stock kitna"],
    run: async () => {
      const rows = (await executeTool("get_inventory_value", {})) as { item_type: string; item_count: number; total_qty: number }[];
      if (!rows.length) return "No inventory data found.";
      return rows.map((r) => `${r.item_type === "product" ? "Products" : "Raw materials"}: ${r.item_count} items, ${r.total_qty} units in stock`).join(". ") + ".";
    },
  },
  {
    keywords: ["tailor workload", "tailor busy", "orders per tailor", "kis tailor"],
    run: async () => {
      const rows = (await executeTool("get_tailor_workload", {})) as { tailor: string; active_orders: number; balance_due: number }[];
      if (!rows.length) return "No active orders assigned to any tailor right now.";
      const top = rows.slice(0, 5).map((r) => `${r.tailor} (${r.active_orders} active)`);
      return `Tailor workload: ${top.join(", ")}.`;
    },
  },
  {
    keywords: ["unpaid invoice", "invoice status", "sales due", "invoice balance"],
    run: async () => {
      const rows = (await executeTool("get_invoice_status_summary", {})) as { payment_status: string; invoice_count: number; total_balance: number }[];
      if (!rows.length) return "No invoices found.";
      return rows.map((r) => `${r.payment_status}: ${r.invoice_count} invoice${r.invoice_count === 1 ? "" : "s"}, ${inr(r.total_balance)} balance`).join(". ") + ".";
    },
  },
  {
    keywords: ["expense", "spending", "kharcha"],
    run: async () => {
      const from = firstOfMonth(today());
      const rows = (await executeTool("get_expenses_summary", { from, to: today() })) as { category: string; total: number }[];
      if (!rows.length) return "No expenses recorded this month yet.";
      const total = rows.reduce((s, r) => s + Number(r.total), 0);
      const top = rows.slice(0, 5).map((r) => `${r.category} ${inr(r.total)}`);
      return `This month's expenses: ${inr(total)} total (${top.join(", ")}).`;
    },
  },
  {
    keywords: ["collect", "payment received", "kitna aaya", "collection"],
    run: async () => {
      const from = firstOfMonth(today());
      const row = (await executeTool("get_payments_total", { from, to: today() })) as { total: number; payment_count: number };
      return `Collected ${inr(row.total)} this month across ${row.payment_count} payment${row.payment_count === 1 ? "" : "s"}.`;
    },
  },
  {
    keywords: ["revenue", "business kitna", "how much business", "total sale"],
    run: async () => {
      const from = firstOfMonth(today());
      const row = (await executeTool("get_revenue_summary", { from, to: today() })) as {
        orders: { billed: number; order_count: number };
        invoices: { billed: number; invoice_count: number };
        collected: number;
      };
      const billed = Number(row.orders.billed) + Number(row.invoices.billed);
      return `This month: ${inr(billed)} billed (${row.orders.order_count} orders + ${row.invoices.invoice_count} invoices), ${inr(row.collected)} collected.`;
    },
  },
];

/**
 * Tries every rule in order and returns the first match's formatted answer, or null if nothing
 * matched (caller falls back to the original "not configured"/error message in that case).
 * Never throws — a failure running the matched tool itself also just falls through to null.
 */
export async function tryFallbackAnswer(question: string): Promise<string | null> {
  const q = question.toLowerCase();
  for (const rule of RULES) {
    // An empty keywords list (the mobile-number lookup rule) means "always try me" — its own
    // run() does the real matching (a regex test) and returns null itself when it doesn't apply.
    if (rule.keywords.length === 0 || rule.keywords.some((k) => q.includes(k))) {
      try {
        const answer = await rule.run(question);
        if (answer) return `${answer}\n\n(Answered from live reports — the AI assistant isn't available right now.)`;
      } catch {
        return null;
      }
    }
  }
  return null;
}
