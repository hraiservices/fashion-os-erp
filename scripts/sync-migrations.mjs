#!/usr/bin/env node
// Runs every file in supabase/migrations/, in filename order, against an EXISTING Supabase
// project's database -- for a deployment (like a demo instance) that was set up a while ago and
// you're not sure which of the newer migrations it's missing. There's no migration-tracking
// table in this project (files are applied by hand or via onboard-customer.mjs, not the Supabase
// CLI's own migration history), so "what's missing" can't be queried directly -- instead this
// just re-applies everything. Migrations that already ran will mostly no-op (IF NOT EXISTS /
// CREATE OR REPLACE / DROP ... IF EXISTS) or fail loudly with a harmless "already exists"-style
// error that's safe to ignore; either way nothing destructive happens to data already there.
// Same tolerant behavior as onboard-customer.mjs's own runMigrations() step, extracted standalone
// so you don't have to run the whole onboarding flow (new Supabase project, new Vercel project,
// etc.) just to catch an existing deployment up to the latest schema.
//
// SETUP: from that project's Supabase dashboard -> Project Settings -> Database, copy:
//   - the project ref (the <ref> in https://<ref>.supabase.co)
//   - the database password (set when the project was created, or reset it there if forgotten)
//
// RUN:
//   node scripts/sync-migrations.mjs --ref=<project-ref> --db-password=<password> --owner-email=<your-login-email>
//   node scripts/sync-migrations.mjs --ref=<project-ref> --db-password=<password> --owner-email=<...> --dry-run
//
// --owner-email fills in OWNER_EMAIL_PLACEHOLDER inside add_module_entitlements.sql, same as
// onboard-customer.mjs does -- pass the demo/customer's own platform-owner email (usually the
// same one you use everywhere else). --dry-run prints the file list without running anything.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

function flag(name) {
  return args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

const ref = flag("ref");
const dbPassword = flag("db-password");
const ownerEmail = flag("owner-email");

if (!ref || (!DRY_RUN && !dbPassword)) {
  console.error("Usage: node scripts/sync-migrations.mjs --ref=<project-ref> --db-password=<password> --owner-email=<email> [--dry-run]");
  process.exit(1);
}

const migrationsDir = join(repoRoot, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

if (DRY_RUN) {
  console.log(`Would run ${files.length} migration files against ${ref}, in this order:\n`);
  files.forEach((f) => console.log(`  ${f}`));
  process.exit(0);
}

const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (e) {
  console.error(
    `Could not connect to db.${ref}.supabase.co:5432 -- some Supabase regions require the ` +
      `pooler connection instead. If this keeps failing, run the migrations by hand via the ` +
      `Supabase SQL Editor (copy/paste each file in supabase/migrations/, in filename order).\n` +
      `Original error: ${e.message}`
  );
  process.exit(1);
}

let applied = 0;
let skipped = 0;

for (const file of files) {
  let sql = readFileSync(join(migrationsDir, file), "utf-8");
  if (file === "add_module_entitlements.sql" && ownerEmail) {
    sql = sql.replaceAll("OWNER_EMAIL_PLACEHOLDER", ownerEmail);
  }
  try {
    await client.query(sql);
    console.log(`  ✓ ${file}`);
    applied++;
  } catch (e) {
    console.log(`  · ${file} -- skipped (${e.message.split("\n")[0]})`);
    skipped++;
  }
}

await client.end();
console.log(`\nDone. ${applied} applied cleanly, ${skipped} skipped (already applied or need manual review).`);
console.log("Re-run with the same flags any time you add new migration files -- already-applied ones will just skip again.");
