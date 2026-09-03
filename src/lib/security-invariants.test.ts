import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Static guards for the invariants the lockdown migrations rely on
 * (lockdown_pin_hash_columns.sql, lockdown_hr_payroll_writes.sql,
 * lockdown_operational_writes.sql).
 *
 * Those migrations revoke write access from `authenticated`, and server routes authenticate as
 * `authenticated` too — so every one of them is only safe while the routes that write those
 * tables reach for the service-role client. That contract is invisible at the call site:
 * `supabase.from("orders").update(...)` looks identical whether it works or 403s, and it fails
 * in production rather than in review. These tests make it fail in CI instead.
 *
 * Static analysis rather than integration tests: the failure mode is a *route* holding the
 * wrong client, which is decided in the source. There is no DB in the unit-test environment,
 * and a query passing against a permissively-configured local database would prove nothing
 * about production's grants.
 */

const SRC = join(process.cwd(), "src");

/** Tables whose INSERT/UPDATE/DELETE is revoked from `authenticated`. Mirrors the table lists in
 *  lockdown_hr_payroll_writes.sql and lockdown_operational_writes.sql. */
const WRITE_LOCKED_TABLES = [
  // HR / compensation
  "employees", "employee_attendance", "employee_advances", "payroll_runs", "payslips",
  // orders + customers
  "orders", "order_payments", "order_expenses", "customers", "referral_coupons", "customer_recommendations",
  // money out / money in
  "expenses", "sales_invoices", "sales_payments", "sales_credit_notes", "sales_quotations",
  "recurring_invoice_profiles", "document_number_sequences",
  "purchase_bills", "purchase_orders", "vendor_payments", "vendor_credits", "vendors",
  // stock
  "products", "raw_materials", "inventory_ledger", "inventory_stock", "warehouses", "units_of_measure",
  "price_lists", "price_list_items", "product_cost_sheets", "cost_sheet_items", "bill_of_materials",
  "work_orders",
  // ops
  "leave_requests", "leave_types", "leave_balances", "leave_balance_adjustments",
  "holidays", "shop_locations", "pos_sessions", "chatbot_messages", "billing_events",
];

/**
 * SECURITY INVOKER RPCs — they run with the caller's privileges, so RLS applies to them. That
 * is what stops a browser calling them directly once the tables are locked, and equally what
 * requires the API routes to invoke them with the service-role client.
 * (The SECURITY DEFINER ones — approve_leave_request, confirm_order_payables,
 * confirm_wo_payable, record_vendor_payment, set_module_entitlements, get_public_invoice —
 * bypass RLS by design and are deliberately not listed.)
 */
const INVOKER_RPCS = [
  "delete_customer_cascade", "change_customer_mobile", "set_order_stage", "backfill_order_payment",
  "reserve_loyalty_discount", "record_order_payment", "refund_loyalty_discount", "delete_order_payment",
  "release_referral_coupon", "rename_order_id", "set_order_rework", "edit_order", "next_document_number",
  "redeem_referral_coupon", "replace_inventory_ledger", "record_sales_credit_note", "record_sales_payment",
  "complete_work_order", "award_loyalty_points",
];

/** Columns `authenticated` has no SELECT grant on at all. */
const CREDENTIAL_COLUMNS = ["pin_hash", "failed_pin_attempts", "pin_locked_until"];
const CREDENTIAL_TABLES = ["employees", "user_roles"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * Client locals in this file that are allowed to touch a locked table:
 *  - anything assigned from createServiceClient()
 *  - a client received as a parameter (`supabase: SupabaseClient<Database>`), because the
 *    caller decides what it is. Every such helper today (loyalty.ts, generate-recurring-
 *    invoice.ts) is server-only and is passed the service-role client by all of its callers.
 */
function allowedClientVars(src: string): Set<string> {
  return new Set([
    ...[...src.matchAll(/const\s+(\w+)\s*=\s*createServiceClient\(\)/g)].map((m) => m[1]),
    ...[...src.matchAll(/(\w+)\s*:\s*SupabaseClient\b/g)].map((m) => m[1]),
  ]);
}

const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;
const rel = (file: string) => file.replace(SRC, "src");

describe("DB lockdown invariants", () => {
  it("only writes write-locked tables through a service-role client", () => {
    const violations: string[] = [];
    const pattern = new RegExp(
      String.raw`(\w+)\s*\n?\s*\.from\("(${WRITE_LOCKED_TABLES.join("|")})"\)((?:\s*\n?\s*\.\w+\([^)]*\))*)`,
      "g"
    );

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      const allowed = allowedClientVars(src);
      for (const m of src.matchAll(pattern)) {
        const [, varName, table, chain] = m;
        const writes = [".insert(", ".update(", ".upsert(", ".delete("].some((op) => chain.includes(op));
        if (writes && !allowed.has(varName)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — ${varName}.from("${table}") writes without a service-role client`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("only calls SECURITY INVOKER money RPCs through a service-role client", () => {
    const violations: string[] = [];
    const pattern = new RegExp(String.raw`(\w+)\.rpc\("(${INVOKER_RPCS.join("|")})"`, "g");

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      const allowed = allowedClientVars(src);
      for (const m of src.matchAll(pattern)) {
        const [, varName, fn] = m;
        if (!allowed.has(varName)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — ${varName}.rpc("${fn}") needs a service-role client`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("never reads credential columns (or select *) off those tables on a non-service client", () => {
    const violations: string[] = [];
    const pattern = new RegExp(
      String.raw`(\w+)\s*\n?\s*\.from\("(${CREDENTIAL_TABLES.join("|")})"\)\s*\n?\s*\.select\(\s*("[^"]*"|\`[^\`]*\`)`,
      "g"
    );

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      const allowed = allowedClientVars(src);
      for (const m of src.matchAll(pattern)) {
        const [, varName, table, selection] = m;
        const risky = selection.includes("*") || CREDENTIAL_COLUMNS.some((c) => selection.includes(c));
        if (risky && !allowed.has(varName)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — ${varName}.from("${table}").select(${selection}) needs a service-role client`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps payroll-bearing and cash-bearing writes out of the browser", () => {
    // employee_attendance is multiplied into gross pay by /api/payroll/run; pos_sessions holds
    // the cash-drawer reconciliation. Both used to be written straight from a hook.
    const attendance = readFileSync(join(SRC, "hooks", "use-attendance.ts"), "utf8");
    expect(attendance).not.toMatch(/from\("employee_attendance"\)\s*\.upsert/);
    expect(attendance).toContain("/api/attendance/mark");

    const pos = readFileSync(join(SRC, "hooks", "use-pos-session.ts"), "utf8");
    expect(pos).not.toMatch(/from\("pos_sessions"\)\s*\.(insert|update)/);
    expect(pos).toContain("/api/pos/session");
  });

  it("derives actor and cash-reconciliation figures on the server, not from the request", () => {
    const attendance = readFileSync(join(SRC, "app", "api", "attendance", "mark", "route.ts"), "utf8");
    expect(attendance).toContain("created_by: user.email");
    expect(attendance).not.toMatch(/created_by:\s*(parsed|body|fd)\./);

    // expected_cash is what a till variance is measured against — if the browser supplies it, a
    // short drawer can be closed showing zero variance.
    const pos = readFileSync(join(SRC, "app", "api", "pos", "session", "route.ts"), "utf8");
    expect(pos).toContain("opened_by: user.email");
    expect(pos).toMatch(/expected_cash: expectedCash/);
    expect(pos).not.toMatch(/expectedCash:\s*z\.number/);
  });
});
