#!/usr/bin/env node
// Automates the "New client onboarding" runbook (docs/module-licensing-runbook.md) end to end:
// creates the customer's own Supabase project, runs every migration against it, applies the
// module entitlements they purchased, creates their own Vercel project, and sets every env var
// the app needs. This is Option A from the onboarding-speed discussion — it keeps the existing
// one-Supabase-project-per-customer architecture (full data isolation) and just stops doing the
// steps by hand.
//
// SETUP (one-time):
//   1. Copy scripts/onboard.local.example.json to scripts/onboard.local.json and fill in:
//      - platformOwnerEmail        (your login email — same as NEXT_PUBLIC_SUPER_ADMIN_EMAIL)
//      - supabase.accessToken      (Supabase dashboard -> Account -> Access Tokens -> generate)
//      - supabase.organizationId   (Supabase dashboard URL when viewing your org: /org/<this>)
//      - vercel.accessToken        (Vercel dashboard -> Settings -> Tokens -> create)
//      - vercel.githubRepo         ("your-username/fashion-os-erp" — must already be on GitHub)
//      - vercel.teamId             (only if the project should live under a Vercel team, else "")
//   That file is gitignored — never commit real tokens.
//
// RUN:
//   node scripts/onboard-customer.mjs                    (interactive prompts)
//   node scripts/onboard-customer.mjs --dry-run           (validates config + prints the plan, creates nothing)
//   node scripts/onboard-customer.mjs --resume-supabase=<ref> --resume-vercel=<projectId>
//                                                          (skip phases already completed if a
//                                                           previous run failed partway through)
//   node scripts/onboard-customer.mjs --name="Sharma Tailors" --slug=sharma-tailors \
//        --app-name="Fashion Flow" --modules=employees,reports --yes
//                                                          (fully non-interactive -- use this if
//                                                           interactive prompts misbehave in your
//                                                           terminal, e.g. Git Bash on Windows
//                                                           piping stdin oddly with readline.
//                                                           --modules is a comma list from:
//                                                           inventory,purchases,sales,employees,
//                                                           expenses,pos,copilot,reports.
//                                                           --yes skips the billing confirmation.)
//
// WHAT THIS DOES NOT AUTOMATE (still manual, per the runbook):
//   - Favicon / theme-color swap for white-labeled customers (public/icon*.svg, viewport.themeColor)
//   - Razorpay webhook wiring (add_billing_events.sql + RAZORPAY_WEBHOOK_SECRET) -- only needed
//     if this customer is on auto-billing, ask first
//   - The very first Vercel deployment sometimes needs a manual "Redeploy" click in their
//     dashboard if the git-triggered deploy doesn't fire -- this script attempts it, but Vercel's
//     deploy-trigger API is the least stable part of this flow; the fallback is one click.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import pg from "pg";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const AUTO_YES = args.includes("--yes");
const resumeSupabase = args.find((a) => a.startsWith("--resume-supabase="))?.split("=")[1];
const resumeVercel = args.find((a) => a.startsWith("--resume-vercel="))?.split("=")[1];
function flag(name) {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}
// Fully non-interactive mode: if --name is given, skip readline entirely (works around the
// readline/promises + piped-stdin quirk some Windows shells hit — see the header comment).
const NONINTERACTIVE = flag("name") !== undefined;

const rl = NONINTERACTIVE ? null : createInterface({ input: process.stdin, output: process.stdout });
async function ask(question, fallback = "") {
  if (!rl) return fallback;
  const answer = (await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
  return answer || fallback;
}

function loadConfig() {
  const configPath = join(__dirname, "onboard.local.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    console.error(`\nCould not read ${configPath}.\nCopy scripts/onboard.local.example.json to scripts/onboard.local.json and fill in your real tokens first.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Supabase Management API
// ---------------------------------------------------------------------------
const SB_API = "https://api.supabase.com/v1";

async function sbFetch(cfg, path, opts = {}) {
  const res = await fetch(`${SB_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.supabase.accessToken}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Supabase API ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createSupabaseProject(cfg, name, dbPassword) {
  console.log(`\n→ Creating Supabase project "${name}" (region: ${cfg.supabase.region})...`);
  const project = await sbFetch(cfg, "/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      organization_id: cfg.supabase.organizationId,
      plan: cfg.supabase.plan || "free",
      region: cfg.supabase.region || "ap-south-1",
      db_pass: dbPassword,
    }),
  });
  console.log(`  Project ref: ${project.id} -- provisioning takes 1-3 minutes...`);
  return project.id;
}

async function waitForSupabaseActive(cfg, ref) {
  for (let i = 0; i < 40; i++) {
    const project = await sbFetch(cfg, `/projects/${ref}`);
    if (project.status === "ACTIVE_HEALTHY") {
      console.log("  Project is active.");
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error("Timed out waiting for Supabase project to become active. Check the dashboard -- it may just need a bit longer.");
}

async function getSupabaseKeys(cfg, ref) {
  const keys = await sbFetch(cfg, `/projects/${ref}/api-keys`);
  const anon = keys.find((k) => k.name === "anon")?.api_key;
  const serviceRole = keys.find((k) => k.name === "service_role")?.api_key;
  if (!anon || !serviceRole) throw new Error("Could not find anon/service_role keys in Supabase's response.");
  return { anon, serviceRole };
}

// ---------------------------------------------------------------------------
// Run every migration file directly against the new database (superuser
// connection, so it also bypasses the set_module_entitlements() RPC guard --
// this script IS the platform owner provisioning the deployment).
// ---------------------------------------------------------------------------
async function runMigrations(ref, dbPassword, ownerEmail) {
  console.log("\n→ Running migrations...");
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `Could not connect to the new database directly (db.${ref}.supabase.co:5432). ` +
        `Some Supabase regions require the pooler connection instead -- if this keeps failing, ` +
        `run the migrations by hand once via the Supabase SQL Editor (copy/paste each file in ` +
        `supabase/migrations/, in filename order) and re-run this script with --resume-supabase=${ref} ` +
        `to skip straight to the Vercel phase.\nOriginal error: ${e.message}`
    );
  }

  const migrationsDir = join(repoRoot, "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    let sql = readFileSync(join(migrationsDir, file), "utf-8");
    if (file === "add_module_entitlements.sql") {
      sql = sql.replaceAll("OWNER_EMAIL_PLACEHOLDER", ownerEmail);
    }
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (e) {
      console.error(`  ✗ ${file} -- ${e.message}`);
      console.error("    Continuing with remaining migrations -- review this one manually afterward (it may just be an idempotent re-run conflict, see the CREATE POLICY note in the runbook).");
    }
  }

  await client.end();
}

async function applyEntitlements(supabaseUrl, serviceRoleKey, modules) {
  console.log("\n→ Applying module entitlements...");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const value = {
    modules,
    reports: {},
    widgets: {},
    settings: {},
    billing: { paidUntil: null, lastPaymentAt: null, razorpaySubscriptionId: null },
    limits: { maxOrdersPerMonth: null, maxStaffAccounts: null },
  };
  const { error } = await supabase.from("app_settings").upsert({ key: "moduleEntitlements", value });
  if (error) throw new Error(`Failed to write moduleEntitlements: ${error.message}`);
  console.log(`  Modules enabled: ${Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ") || "(core only)"}`);
}

// ---------------------------------------------------------------------------
// Vercel API
// ---------------------------------------------------------------------------
async function vcFetch(cfg, path, opts = {}) {
  const teamQuery = cfg.vercel.teamId ? `${path.includes("?") ? "&" : "?"}teamId=${cfg.vercel.teamId}` : "";
  const res = await fetch(`https://api.vercel.com${path}${teamQuery}`, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.vercel.accessToken}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vercel API ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createVercelProject(cfg, name) {
  console.log(`\n→ Creating Vercel project "${name}"...`);
  const project = await vcFetch(cfg, "/v11/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      framework: "nextjs",
      gitRepository: { type: "github", repo: cfg.vercel.githubRepo },
    }),
  });
  console.log(`  Vercel project ID: ${project.id}`);
  return project.id;
}

async function setVercelEnvVars(cfg, projectId, vars) {
  console.log("\n→ Setting environment variables...");
  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue;
    try {
      await vcFetch(cfg, `/v10/projects/${projectId}/env`, {
        method: "POST",
        body: JSON.stringify({ key, value: String(value), type: "encrypted", target: ["production", "preview", "development"] }),
      });
      console.log(`  ✓ ${key}`);
    } catch (e) {
      console.error(`  ✗ ${key} -- ${e.message} (set this one manually in the Vercel dashboard)`);
    }
  }
}

async function triggerVercelDeploy(cfg, projectId, projectName) {
  console.log("\n→ Attempting to trigger the first deployment...");
  try {
    await vcFetch(cfg, "/v13/deployments", {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        project: projectId,
        target: "production",
        gitSource: { type: "github", repo: cfg.vercel.githubRepo.split("/")[1], org: cfg.vercel.githubRepo.split("/")[0], ref: cfg.vercel.productionBranch || "main" },
      }),
    });
    console.log("  Deployment triggered.");
  } catch (e) {
    console.log(`  Could not auto-trigger a deployment (${e.message}).`);
    console.log(`  This is the least stable step -- just open the Vercel dashboard for this project and click "Redeploy" (or push any commit to ${cfg.vercel.productionBranch || "main"}) to finish.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const cfg = loadConfig();

  console.log("=== Fashion Flow — New Customer Onboarding ===");
  const moduleIds = ["inventory", "purchases", "sales", "employees", "expenses", "pos", "copilot", "reports"];
  let customerName, slug, appName, modules;

  if (NONINTERACTIVE) {
    customerName = flag("name");
    slug = flag("slug") || customerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    appName = flag("app-name") || cfg.appDefaults?.appName || "Fashion Flow";
    const requested = new Set((flag("modules") || "").split(",").map((s) => s.trim()).filter(Boolean));
    modules = Object.fromEntries(moduleIds.map((id) => [id, requested.has(id)]));
  } else {
    customerName = await ask("Customer / shop name (e.g. \"Sharma Tailors\")");
    slug = (await ask("Project slug (lowercase, no spaces)", customerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))) || "customer";
    appName = await ask("App display name shown in the browser tab", cfg.appDefaults?.appName || "Fashion Flow");

    console.log("\nWhich modules did they buy? (y/n for each)");
    modules = {};
    for (const id of moduleIds) {
      const answer = (await ask(`  ${id}`, "n")).toLowerCase();
      modules[id] = answer === "y" || answer === "yes";
    }
  }

  console.log("\n--- Plan ---");
  console.log(`Customer:        ${customerName}`);
  console.log(`Supabase project: fashion-flow-${slug}`);
  console.log(`Vercel project:   fashion-flow-${slug}`);
  console.log(`Modules:          ${Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ") || "(core only)"}`);
  console.log(`Owner email:      ${cfg.platformOwnerEmail}`);

  if (DRY_RUN) {
    console.log("\n--dry-run set -- stopping here. Nothing was created.");
    rl?.close();
    return;
  }

  if (!AUTO_YES) {
    const confirm = await ask('\nThis will create BILLABLE Supabase and Vercel resources. Type "yes" to continue', "no");
    if (confirm.toLowerCase() !== "yes") {
      console.log("Aborted -- nothing was created.");
      rl?.close();
      return;
    }
  } else {
    console.log("\n--yes set -- skipping confirmation. This will create BILLABLE Supabase and Vercel resources.");
  }

  const dbPassword = randomBytes(18).toString("base64url");
  const attendanceSecret = randomBytes(32).toString("hex");
  const vapid = webpush.generateVAPIDKeys();

  let supabaseRef = resumeSupabase;
  if (!supabaseRef) {
    supabaseRef = await createSupabaseProject(cfg, `fashion-flow-${slug}`, dbPassword);
    await waitForSupabaseActive(cfg, supabaseRef);
  } else {
    console.log(`\n→ Resuming with existing Supabase project ${supabaseRef} (skipping creation).`);
  }

  const { anon, serviceRole } = await getSupabaseKeys(cfg, supabaseRef);
  const supabaseUrl = `https://${supabaseRef}.supabase.co`;

  if (!resumeSupabase) {
    // Only run migrations for a freshly-created project -- if resuming, assume they're already
    // applied (or were applied by hand per the error message in runMigrations()).
    await runMigrations(supabaseRef, dbPassword, cfg.platformOwnerEmail);
  }
  await applyEntitlements(supabaseUrl, serviceRole, modules);

  let vercelProjectId = resumeVercel;
  if (!vercelProjectId) {
    vercelProjectId = await createVercelProject(cfg, `fashion-flow-${slug}`);
  } else {
    console.log(`\n→ Resuming with existing Vercel project ${vercelProjectId} (skipping creation).`);
  }

  await setVercelEnvVars(cfg, vercelProjectId, {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    NEXT_PUBLIC_SUPER_ADMIN_EMAIL: cfg.platformOwnerEmail,
    NEXT_PUBLIC_APP_NAME: appName,
    ATTENDANCE_SESSION_SECRET: attendanceSecret,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: `mailto:${cfg.platformOwnerEmail}`,
  });

  await triggerVercelDeploy(cfg, vercelProjectId, `fashion-flow-${slug}`);

  console.log("\n=== Done ===");
  console.log(`Supabase dashboard: https://supabase.com/dashboard/project/${supabaseRef}`);
  console.log(`Vercel project:     https://vercel.com/${cfg.vercel.teamId ? cfg.vercel.teamId + "/" : ""}fashion-flow-${slug}`);
  console.log(`DB password (save this somewhere safe): ${dbPassword}`);
  console.log("\nStill manual, if this is a white-labeled customer:");
  console.log("  - Swap favicon/theme-color (public/icon*.svg, viewport.themeColor in src/app/layout.tsx) before handing over");
  console.log("  - Razorpay auto-billing wiring, if they're on a subscription (see docs/module-licensing-runbook.md)");
  console.log(`  - Add "${customerName}" to scripts/customers.local.json so they show up in npm run usage-report`);

  rl?.close();
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  rl?.close();
  process.exit(1);
});
