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
//
// CONNECTION ISSUES: the direct db.<ref>.supabase.co:5432 host is IPv6-only and unreachable from
// many home/office networks (ETIMEDOUT / ENOTFOUND). If that happens, open the same project's
// Database settings page -> "Connection pooling" section, copy the pooler host (something like
// aws-0-<region>.pooler.supabase.com) and its port (6543 for transaction mode, 5432 for session
// mode), and pass them here to override the direct-connection default:
//   node scripts/sync-migrations.mjs --ref=<project-ref> --db-password=<password> --owner-email=<...> \
//     --host=aws-0-<region>.pooler.supabase.com --port=6543
// The pooler's actual Postgres username is `postgres.<project-ref>` (not plain `postgres`) --
// this script fills that in automatically whenever --host is passed.

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
const host = flag("host") || `db.${ref}.supabase.co`;
const port = flag("port") || "5432";
// The pooler authenticates as postgres.<project-ref>, not plain postgres -- direct-connection
// mode keeps the plain username unless a pooler host was explicitly passed.
const pgUser = flag("host") ? `postgres.${ref}` : "postgres";

if (!ref || (!DRY_RUN && !dbPassword)) {
  console.error("Usage: node scripts/sync-migrations.mjs --ref=<project-ref> --db-password=<password> --owner-email=<email> [--host=<pooler-host> --port=<pooler-port>] [--dry-run]");
  process.exit(1);
}

const migrationsDir = join(repoRoot, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

if (DRY_RUN) {
  console.log(`Would run ${files.length} migration files against ${ref}, in this order:\n`);
  files.forEach((f) => console.log(`  ${f}`));
  process.exit(0);
}

const connectionString = `postgresql://${pgUser}:${encodeURIComponent(dbPassword)}@${host}:${port}/postgres`;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (e) {
  console.error(
    `Could not connect to ${host}:${port} -- some Supabase regions require the pooler ` +
      `connection instead of the direct db.<ref>.supabase.co host (see the CONNECTION ISSUES ` +
      `note at the top of this file for --host/--port). If this keeps failing, run the ` +
      `migrations by hand via the Supabase SQL Editor (copy/paste each file in ` +
      `supabase/migrations/, in filename order).\n` +
      `Original error: ${e.message}`
  );
  process.exit(1);
}

// Filenames are sorted alphabetically as a stand-in for chronological order, which mostly
// works but isn't guaranteed -- a handful of migrations depend on a function/table a
// later-sorted file creates (e.g. add_early_tailor_payables.sql needs
// snapshot_tailor_payables() from add_tailor_payable_snapshot.sql, which sorts after it). A
// file that fails for that reason also rolls back everything else it would have created in the
// same statement batch, which can cascade into a second file failing too. Re-running the whole
// failed set in extra passes lets a genuinely out-of-order dependency resolve itself once its
// prerequisite has run, without having to guess which files depend on which up front. A file
// that's failing because it's simply already applied just fails the same way every pass, so
// this only costs a few harmless extra round-trips, not correctness.
let applied = 0;
let pending = files;
let lastResults = [];

for (let pass = 1; pending.length > 0; pass++) {
  const stillPending = [];
  lastResults = [];
  for (const file of pending) {
    let sql = readFileSync(join(migrationsDir, file), "utf-8");
    if (file === "add_module_entitlements.sql" && ownerEmail) {
      sql = sql.replaceAll("OWNER_EMAIL_PLACEHOLDER", ownerEmail);
    }
    try {
      await client.query(sql);
      if (pass > 1) console.log(`  ✓ ${file} (resolved on retry pass ${pass})`);
      else console.log(`  ✓ ${file}`);
      applied++;
    } catch (e) {
      stillPending.push(file);
      lastResults.push({ file, message: e.message.split("\n")[0] });
    }
  }
  if (stillPending.length === pending.length) break; // no progress this pass -- stop retrying
  pending = stillPending;
}

for (const { file, message } of lastResults) {
  console.log(`  · ${file} -- skipped (${message})`);
}

await client.end();
console.log(`\nDone. ${applied} applied cleanly, ${lastResults.length} skipped (already applied or need manual review).`);
console.log("Re-run with the same flags any time you add new migration files -- already-applied ones will just skip again.");
