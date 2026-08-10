#!/usr/bin/env node
// Manual usage/adoption check across every customer deployment. Not part of the app build or
// any scheduled/hosted service — run by hand whenever you want a check-in before a renewal
// conversation. Each customer is a separate Supabase project (per the module-licensing
// architecture), so this connects to each one individually with its service-role key.
//
// Setup: copy scripts/customers.local.example.json to scripts/customers.local.json and fill in
// each customer's Supabase URL + service-role key (Project Settings > API > service_role).
// That file is gitignored — never commit real credentials.
//
// Run: node scripts/usage-report.mjs   (or: npm run usage-report)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "customers.local.json");

let customers;
try {
  customers = JSON.parse(readFileSync(configPath, "utf-8"));
} catch {
  console.error(`Could not read ${configPath}.\nCopy scripts/customers.local.example.json to scripts/customers.local.json and fill in your customers' Supabase details first.`);
  process.exit(1);
}

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function reportOne({ name, supabaseUrl, serviceRoleKey }) {
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const [{ count: orderCount }, { count: invoiceCount }, { count: customerCount }, { count: ordersThisMonth }, { data: entSetting }, { data: shopSetting }, { data: lastOrder }] =
    await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("sales_invoices").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfMonthISO()),
      supabase.from("app_settings").select("value").eq("key", "moduleEntitlements").maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
      supabase.from("orders").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const modules = entSetting?.value?.modules || {};
  const licensedModules = Object.entries(modules).filter(([, v]) => v !== false).map(([k]) => k);
  const paidUntil = entSetting?.value?.billing?.paidUntil || "—";

  return {
    Customer: name || shopSetting?.value?.name || "(unnamed)",
    "Licensed modules": licensedModules.join(", ") || "core only",
    "Paid until": paidUntil,
    Orders: orderCount ?? "?",
    "Orders this month": ordersThisMonth ?? "?",
    Invoices: invoiceCount ?? "?",
    Customers: customerCount ?? "?",
    "Last order": lastOrder?.created_at ? new Date(lastOrder.created_at).toLocaleDateString("en-IN") : "never",
  };
}

const results = [];
for (const c of customers) {
  try {
    results.push(await reportOne(c));
  } catch (e) {
    results.push({ Customer: c.name, "Licensed modules": "ERROR", "Paid until": String(e instanceof Error ? e.message : e) });
  }
}

console.table(results);
