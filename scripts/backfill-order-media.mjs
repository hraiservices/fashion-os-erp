#!/usr/bin/env node
// Phase 2 of the order-media Storage migration (see
// supabase/migrations/create_order_media_storage_bucket.sql and
// src/lib/supabase/media-storage.ts). Phase 1 (already shipped) only migrates a photo the moment
// an order is next created or edited -- new/untouched orders keep their base64 images until then.
// This backfills every EXISTING order's already-stored base64 photos into the same "order-media"
// Storage bucket, so orders.images stops holding any base64 data at all, regardless of whether
// that order is ever edited again.
//
// Idempotent and safe to re-run: an image that's already a Storage path (migrated by Phase 1's
// opportunistic upload, or by a previous run of this script) is left untouched. A failed upload
// for one photo leaves that photo as base64 and moves on -- re-run the script to retry it.
//
// SETUP: Supabase dashboard -> Project Settings -> API, copy the Project URL and the
// service_role key (NOT the anon key -- this needs to bypass RLS the same way the app's own
// server routes do). Or, if this project's own .env.local already has
// NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set, omit both flags to read them from
// there instead.
//
// RUN:
//   node scripts/backfill-order-media.mjs --url=<supabase-url> --service-role-key=<key>
//   node scripts/backfill-order-media.mjs --url=<supabase-url> --service-role-key=<key> --dry-run
//
// --dry-run prints what WOULD be uploaded/updated without writing anything -- always run this first.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

function flag(name) {
  return args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

function envFromDotenvLocal(key) {
  try {
    const text = readFileSync(join(__dirname, "..", ".env.local"), "utf-8");
    const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    return match?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const url = flag("url") || envFromDotenvLocal("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = flag("service-role-key") || envFromDotenvLocal("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !serviceRoleKey) {
  console.error("Usage: node scripts/backfill-order-media.mjs --url=<supabase-url> --service-role-key=<key> [--dry-run]");
  console.error("(or leave both off to read NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local instead)");
  process.exit(1);
}

const ORDER_MEDIA_BUCKET = "order-media";
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

// Same convention as src/lib/supabase/media-storage-shared.ts: a Storage path never starts with
// "data:", a not-yet-migrated legacy image always does.
function isOrderMediaPath(value) {
  return !!value && !value.startsWith("data:");
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl);
  const contentType = match?.[1] || "image/jpeg";
  const base64 = match?.[2] || "";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "jpg";
  return { contentType, extension, bytes: Buffer.from(base64, "base64") };
}

async function uploadOrderImage(orderId, dataUrl) {
  const { contentType, extension, bytes } = parseImageDataUrl(dataUrl);
  const path = `${orderId}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(ORDER_MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

const { data: orders, error } = await supabase.from("orders").select("id, images").not("images", "is", null);
if (error) {
  console.error("Could not read orders:", error.message);
  process.exit(1);
}

const toMigrate = (orders || []).filter((o) => Array.isArray(o.images) && o.images.some((img) => !isOrderMediaPath(img)));
console.log(`Found ${toMigrate.length} order(s) with at least one base64 photo still stored inline.\n`);

let migratedOrders = 0;
let migratedImages = 0;
let failedImages = 0;

for (const order of toMigrate) {
  const legacyCount = order.images.filter((img) => !isOrderMediaPath(img)).length;
  console.log(`  ${DRY_RUN ? "would migrate" : "migrating"} ${order.id}: ${legacyCount} photo(s)`);

  if (DRY_RUN) {
    migratedImages += legacyCount;
    migratedOrders++;
    continue;
  }

  const nextImages = [];
  let changed = false;
  for (const img of order.images) {
    if (isOrderMediaPath(img)) {
      nextImages.push(img);
      continue;
    }
    try {
      nextImages.push(await uploadOrderImage(order.id, img));
      changed = true;
      migratedImages++;
    } catch (e) {
      console.log(`    ! upload failed (${e.message}) — leaving that photo as base64`);
      nextImages.push(img);
      failedImages++;
    }
  }
  if (!changed) continue;

  const { error: updateError } = await supabase.from("orders").update({ images: nextImages }).eq("id", order.id);
  if (updateError) {
    console.log(`    ! could not save updated images (${updateError.message})`);
    continue;
  }
  migratedOrders++;
}

console.log(
  `\n${DRY_RUN ? "Would migrate" : "Migrated"} ${migratedImages} photo(s) across ${migratedOrders} order(s).` +
    (failedImages > 0 ? ` ${failedImages} photo upload(s) failed and were left as base64 — safe to re-run.` : "")
);
if (DRY_RUN) console.log("This was a dry run — nothing was written. Re-run without --dry-run to apply.");
