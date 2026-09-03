import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Static guards for the two DB-level invariants that lockdown_pin_hash_columns.sql and
 * lockdown_hr_payroll_writes.sql rely on. Both migrations are only safe while the application
 * keeps its side of the bargain, and both bargains are invisible at the call site — nothing in
 * `supabase.from("employees").update(...)` looks wrong until you know which client `supabase`
 * is. These tests make that visible in CI instead of in production.
 *
 * Why static analysis rather than an integration test: the failure mode is a *route* reaching
 * for the wrong client, which is decided at the source level. There's no DB in the unit-test
 * environment, and a passing query against a permissive local database would prove nothing
 * about production's grants anyway.
 */

const SRC = join(process.cwd(), "src");

/** Tables whose INSERT/UPDATE/DELETE is revoked from `authenticated` — every write must run on
 *  a service-role client, behind an explicit permission check in the route. */
const WRITE_LOCKED_TABLES = ["employees", "employee_attendance", "employee_advances", "payroll_runs", "payslips"];

/** Columns `authenticated` has no SELECT grant on. Reading them needs the service-role client;
 *  `select("*")` on their tables now fails for everyone else. */
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

/** Locals assigned from createServiceClient() in this file — the only clients allowed to touch
 *  a locked table or a credential column. Named per-file because routes vary (`db`,
 *  `serviceClient`, and in the attendance routes simply `supabase`). */
function serviceClientVars(src: string): Set<string> {
  return new Set([...src.matchAll(/const\s+(\w+)\s*=\s*createServiceClient\(\)/g)].map((m) => m[1]));
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

describe("DB lockdown invariants", () => {
  it("only writes the HR/payroll tables through a service-role client", () => {
    const violations: string[] = [];
    const pattern = new RegExp(
      String.raw`(\w+)\s*\.from\("(${WRITE_LOCKED_TABLES.join("|")})"\)((?:\s*\.\w+\([^)]*\))*)`,
      "g"
    );

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      const service = serviceClientVars(src);
      for (const m of src.matchAll(pattern)) {
        const [, varName, table, chain] = m;
        const writes = [".insert(", ".update(", ".upsert(", ".delete("].some((op) => chain.includes(op));
        if (writes && !service.has(varName)) {
          violations.push(`${file.replace(SRC, "src")}:${lineOf(src, m.index!)} — ${varName}.from("${table}") writes without a service-role client`);
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
      const service = serviceClientVars(src);
      for (const m of src.matchAll(pattern)) {
        const [, varName, table, selection] = m;
        const risky = selection.includes("*") || CREDENTIAL_COLUMNS.some((c) => selection.includes(c));
        if (risky && !service.has(varName)) {
          violations.push(`${file.replace(SRC, "src")}:${lineOf(src, m.index!)} — ${varName}.from("${table}").select(${selection}) needs a service-role client`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the attendance grid off a direct browser upsert", () => {
    // employee_attendance rows are multiplied into gross pay by /api/payroll/run, so a
    // browser-side write here is a payroll-fraud vector, not just a permissions slip.
    const hook = readFileSync(join(SRC, "hooks", "use-attendance.ts"), "utf8");
    expect(hook).not.toMatch(/from\("employee_attendance"\)\s*\.upsert/);
    expect(hook).toContain("/api/attendance/mark");
  });

  it("does not let the client choose who an attendance row is attributed to", () => {
    // created_by is derived from the session server-side; accepting it from the body made the
    // audit trail say whatever the caller typed.
    const route = readFileSync(join(SRC, "app", "api", "attendance", "mark", "route.ts"), "utf8");
    expect(route).toContain("created_by: user.email");
    expect(route).not.toMatch(/created_by:\s*(parsed|body|fd)\./);
  });
});
