import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { ROLE_DEFAULTS } from "@/lib/permissions";

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

/** Also revoked from `authenticated` — see lockdown_employee_salary_columns.sql. Selecting one
 *  of these on a non-service client fails the whole query, it does not just omit the column. */
const SALARY_COLUMNS = ["salary_type", "salary_rate", "piece_rate_eligible"];

/** Views `authenticated` and `anon` have no SELECT grant on — the AI Copilot reads them as the
 *  separate `chatbot_readonly` Postgres role, the daily briefing with the service client.
 *  v_chatbot_orders is every order and v_chatbot_payments every payment, so a browser read of
 *  one of these would walk straight around every read policy in lockdown_reads_*.sql. */
const REVOKED_VIEWS = [
  "v_chatbot_orders", "v_chatbot_invoices", "v_chatbot_expenses", "v_chatbot_payments", "v_chatbot_inventory",
];

/** Tables whose SELECT is no longer `USING (true)` for `authenticated`. Mirrors the rule lists in
 *  lockdown_reads_whole_table.sql and lockdown_reads_per_row.sql. */
const READ_LOCKED_TABLES = [
  // whole-table permission gates
  "payroll_runs", "expenses", "order_expenses", "billing_events",
  "purchase_bills", "purchase_orders", "vendors", "vendor_payments", "vendor_credits",
  "product_cost_sheets", "cost_sheet_items", "bill_of_materials", "price_lists", "price_list_items",
  "sales_invoices", "sales_payments", "sales_credit_notes", "sales_quotations", "recurring_invoice_profiles",
  "customers", "referral_coupons", "customer_recommendations",
  "products", "raw_materials", "inventory_ledger", "inventory_stock", "warehouses", "units_of_measure",
  "activity_log",
  // per-row rules
  "payslips", "employee_advances", "employee_attendance",
  "leave_requests", "leave_balances", "leave_balance_adjustments",
  "chatbot_messages", "pos_sessions", "user_roles", "order_payments", "orders", "work_orders",
];

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

  it("never reads salary columns or the chatbot views on a non-service client", () => {
    const violations: string[] = [];
    const selectPattern = new RegExp(
      String.raw`(\w+)\s*\n?\s*\.from\("employees"\)\s*\n?\s*\.select\(\s*("[^"]*"|\`[^\`]*\`|\w+)`,
      "g"
    );
    const viewPattern = new RegExp(String.raw`(\w+)\s*\n?\s*\.from\("(${REVOKED_VIEWS.join("|")})"\)`, "g");

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      const allowed = allowedClientVars(src);

      for (const m of selectPattern[Symbol.matchAll] ? src.matchAll(selectPattern) : []) {
        const [, varName, selection] = m;
        // An identifier rather than a literal — resolve it to the constant it names, so a
        // hoisted column list is checked too rather than waved through.
        const literal = selection.startsWith('"') || selection.startsWith("`")
          ? selection
          : (src.match(new RegExp(String.raw`const\s+${selection}\s*=\s*([^;]+);`))?.[1] ?? "");
        if (SALARY_COLUMNS.some((c) => literal.includes(c)) && !allowed.has(varName)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — ${varName}.from("employees") selects a salary column without a service-role client`);
        }
      }

      for (const m of src.matchAll(viewPattern)) {
        const [, varName, view] = m;
        if (!allowed.has(varName)) {
          violations.push(`${rel(file)}:${lineOf(src, m.index!)} — ${varName}.from("${view}") needs a service-role client`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not read read-locked tables on the caller's own session in API routes", () => {
    // getServerUser() hands back a cookie client that authenticates as `authenticated` — the
    // same role the read policies restrict. A route that reads a read-locked table with it does
    // not fail; it silently returns fewer rows, and a report quietly loses a section. The
    // allowlist below is every place that is deliberately fine, with the reason.
    const allowedByRoute = new Map<string, string>([
      // Reads its OWN user_roles row, which the self-scoped policy permits by design.
      ["src/lib/auth-server.ts", "own user_roles row"],
      ["src/lib/supabase/session.ts", "own user_roles row"],
      // Gated on exactly the permission the policy checks, so the caller's session can see it.
      ["src/app/api/user-roles/pin/route.ts", "manageUsers"],
      ["src/app/api/user-roles/provision-phone/route.ts", "manageUsers"],
      ["src/app/api/employees/[id]/leave-balance/route.ts", "manageEmployees"],
      ["src/app/api/leave-requests/[id]/approve/route.ts", "manageEmployees"],
      ["src/app/api/whatsapp/broadcast/route.ts", "manageCustomers"],
      ["src/app/api/sales/recurring-invoices/[id]/generate-now/route.ts", "manageSales"],
      ["src/app/api/sales/invoices/[id]/pdf/route.tsx", "manageSales || usePOS"],
      ["src/app/api/customers/[mobile]/measurements/pdf/route.tsx", "manageCustomers"],
    ]);

    const violations: string[] = [];
    const pattern = new RegExp(String.raw`(\w+)\s*\n?\s*\.from\("(${READ_LOCKED_TABLES.join("|")})"\)`, "g");

    for (const file of sourceFiles(SRC)) {
      const relPath = rel(file).replace(/\\/g, "/");
      if (!relPath.includes("/api/") && !relPath.startsWith("src/lib")) continue;
      if (allowedByRoute.has(relPath)) continue;

      const src = readFileSync(file, "utf8");
      const allowed = allowedClientVars(src);
      for (const m of src.matchAll(pattern)) {
        const [, varName, table] = m;
        if (!allowed.has(varName)) {
          violations.push(`${relPath}:${lineOf(src, m.index!)} — ${varName}.from("${table}") reads a read-locked table on the caller's own session`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the SQL permission matrix identical to ROLE_DEFAULTS", () => {
    // has_perm() in add_rls_identity_helpers.sql is a SQL port of resolvePerms(), and every read
    // policy is written in terms of it. The default matrix is therefore duplicated in two
    // languages: flip a flag in permissions.ts alone and the database quietly disagrees with the
    // UI about who may see what — in whichever direction is worse.
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "add_rls_identity_helpers.sql"), "utf8");
    const literal = sql.match(/SELECT\s+'(\{[\s\S]*?\})'::jsonb;/)?.[1];
    expect(literal, "rls_role_defaults() jsonb literal not found").toBeTruthy();
    expect(JSON.parse(literal!)).toEqual(ROLE_DEFAULTS);
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
