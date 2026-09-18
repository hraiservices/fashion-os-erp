#!/usr/bin/env node
// One-time cleanup for order history lines written BEFORE resolveActingUserName() existed (or
// before a route was fixed to use it) — those lines have a dashboard-access tailor's raw
// "emp-<uuid>" id baked directly into the stored text (e.g. "Delivered — ... by
// emp-f868385c-3118-4227-9454-dfa4ea9a9aeb"), which nothing can fix retroactively except
// rewriting the stored text itself. Finds every orders.history entry matching that pattern,
// looks up the employee by id, and replaces the raw id with their real name. Never touches
// history that already has a real name or a plain login email.
//
// SETUP: same as scripts/sync-migrations.mjs -- from the target project's Supabase dashboard ->
// Project Settings -> Database, copy the project ref and database password.
//
// RUN:
//   node scripts/backfill-employee-names.mjs --ref=<project-ref> --db-password=<password>
//   node scripts/backfill-employee-names.mjs --ref=<project-ref> --db-password=<password> --dry-run
//
// --dry-run prints what WOULD change without writing anything -- always run this first.

import pg from "pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

function flag(name) {
  return args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

const ref = flag("ref");
const dbPassword = flag("db-password");

if (!ref || !dbPassword) {
  console.error("Usage: node scripts/backfill-employee-names.mjs --ref=<project-ref> --db-password=<password> [--dry-run]");
  process.exit(1);
}

const RAW_ID_RE = /\bemp-([0-9a-fA-F-]{36})\b/g;

const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (e) {
  console.error(
    `Could not connect to db.${ref}.supabase.co:5432 -- some Supabase regions require the ` +
      `pooler connection instead.\nOriginal error: ${e.message}`
  );
  process.exit(1);
}

const { rows: employees } = await client.query("SELECT id, name FROM employees");
const nameById = new Map(employees.map((e) => [e.id, e.name]));

// Only pull orders whose history text plausibly contains a raw id -- cheap filter before the
// per-row regex work below.
const { rows: orders } = await client.query(
  `SELECT id, history FROM orders WHERE history::text ~ 'emp-[0-9a-fA-F-]{36}'`
);

console.log(`Found ${orders.length} order(s) with a raw employee id in their history.\n`);

let rewritten = 0;
let unresolved = 0;

for (const order of orders) {
  const lines = Array.isArray(order.history) ? order.history : [];
  let changed = false;
  const newLines = lines.map((line) => {
    if (typeof line !== "string") return line;
    return line.replace(RAW_ID_RE, (match, id) => {
      const name = nameById.get(id);
      if (!name) {
        console.log(`  ? ${order.id}: no employee found for id ${id} -- leaving as-is`);
        unresolved++;
        return match;
      }
      changed = true;
      return name;
    });
  });

  if (!changed) continue;
  rewritten++;
  console.log(`  ✓ ${order.id}`);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== newLines[i]) {
      console.log(`      "${lines[i]}"\n      → "${newLines[i]}"`);
    }
  }

  if (!DRY_RUN) {
    await client.query("UPDATE orders SET history = $1::jsonb WHERE id = $2", [JSON.stringify(newLines), order.id]);
  }
}

await client.end();
console.log(`\n${DRY_RUN ? "Would rewrite" : "Rewrote"} ${rewritten} order(s). ${unresolved} raw id(s) had no matching employee and were left alone.`);
if (DRY_RUN) console.log("This was a dry run -- nothing was written. Re-run without --dry-run to apply.");
