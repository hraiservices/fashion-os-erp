import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { daysLeft, normalizeIndianMobile } from "@/lib/business-rules";
import { deriveInvoiceBalance } from "@/lib/sales";
import { inr } from "@/lib/format";
import { sendWhatsAppTemplateText, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { logWhatsAppSend } from "@/lib/whatsapp-log";

const DEFAULT_MIN_DAYS_OVERDUE = 3;
const DEFAULT_COOLDOWN_DAYS = 7;

/**
 * Cron entry point — auto-sends the same "₹X is due" message the Customer Balances report's
 * manual WhatsApp button already builds, but on a schedule instead of requiring the owner to
 * click through the report. Mirrors the daily-briefing cron's auth pattern (CRON_SECRET bearer
 * token, service-role client, no logged-in session).
 *
 * A customer is reminded at most once per paymentReminderCooldownDays, tracked via
 * whatsapp_message_log rather than a separate table — that log already exists for the send
 * audit trail, so it doubles as the cooldown gate for free. whatsapp_opt_out is checked before
 * every send, same as the ready-for-pickup nudge.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 501 });

  const [{ data: cloudApiSetting }, { data: minDaysSetting }, { data: cooldownSetting }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "paymentReminderMinDaysOverdue").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "paymentReminderCooldownDays").maybeSingle(),
  ]);
  const cloudApi = cloudApiSetting?.value as WhatsAppCloudApiConfig | null;
  const minDaysOverdue = typeof minDaysSetting?.value === "number" ? minDaysSetting.value : DEFAULT_MIN_DAYS_OVERDUE;
  const cooldownDays = typeof cooldownSetting?.value === "number" ? cooldownSetting.value : DEFAULT_COOLDOWN_DAYS;

  if (!cloudApi?.phoneNumberId || !cloudApi?.accessToken || !cloudApi?.paymentReminderTemplateName) {
    return NextResponse.json({ skipped: true, reason: "Payment reminder template not configured" });
  }

  // Stitching orders — balance is already a stored, authoritative column.
  const { data: orderRows } = await supabase
    .from("orders")
    .select("mobile, name, status, delivery_date, balance")
    .gt("balance", 0)
    .not("status", "in", "(delivered,payment)");

  // Sales invoices — balance is derived the same way useSalesInvoices() does client-side.
  const [{ data: invoiceRows }, { data: paymentRows }, { data: creditRows }] = await Promise.all([
    supabase.from("sales_invoices").select("id, customer_mobile, customer_name, total, due_date").not("due_date", "is", null),
    supabase.from("sales_payments").select("invoice_id, amount"),
    supabase.from("sales_credit_notes").select("invoice_id, total"),
  ]);
  const paidByInvoice = new Map<string, number>();
  (paymentRows || []).forEach((p) => paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + p.amount));
  const creditsByInvoice = new Map<string, number>();
  (creditRows || []).forEach((c) => creditsByInvoice.set(c.invoice_id, (creditsByInvoice.get(c.invoice_id) || 0) + c.total));

  const dueByMobile = new Map<string, { name: string; due: number }>();
  const bump = (rawMobile: string, name: string, amount: number) => {
    // Normalize first: a customer whose order has "9876543210" but whose invoice has
    // "919876543210" would otherwise be treated as two different people, splitting their due
    // amount across two map entries and sending two separate reminders (or one to a malformed
    // "9191..." number, if the un-normalized value were used to build the WhatsApp recipient).
    const mobile = normalizeIndianMobile(rawMobile);
    if (!mobile || amount <= 0) return;
    const existing = dueByMobile.get(mobile);
    if (existing) existing.due += amount;
    else dueByMobile.set(mobile, { name, due: amount });
  };

  (orderRows || []).forEach((o) => {
    if (daysLeft(o.delivery_date) <= -minDaysOverdue) bump(o.mobile, o.name, o.balance);
  });
  (invoiceRows || []).forEach((inv) => {
    if (!inv.due_date || daysLeft(inv.due_date) > -minDaysOverdue) return;
    const balance = deriveInvoiceBalance(inv.total, creditsByInvoice.get(inv.id) || 0, paidByInvoice.get(inv.id) || 0);
    bump(inv.customer_mobile, inv.customer_name, balance);
  });

  if (dueByMobile.size === 0) return NextResponse.json({ sent: 0, skipped: 0 });

  const mobiles = [...dueByMobile.keys()];
  const [{ data: optOutRows }, { data: recentReminders }] = await Promise.all([
    supabase.from("customers").select("mobile, whatsapp_opt_out").in("mobile", mobiles),
    supabase
      .from("whatsapp_message_log")
      .select("to_mobile")
      .eq("message_type", "payment_reminder")
      .gte("created_at", new Date(Date.now() - cooldownDays * 86_400_000).toISOString()),
  ]);
  const optedOut = new Set((optOutRows || []).filter((c) => c.whatsapp_opt_out).map((c) => c.mobile));
  const recentlyReminded = new Set((recentReminders || []).map((r) => r.to_mobile));

  let sent = 0;
  let skipped = 0;
  for (const [mobile, { name, due }] of dueByMobile) {
    const toMobile = `91${mobile}`;
    if (optedOut.has(mobile) || recentlyReminded.has(toMobile) || recentlyReminded.has(mobile)) {
      skipped++;
      continue;
    }
    try {
      const waMessageId = await sendWhatsAppTemplateText(cloudApi, toMobile, cloudApi.paymentReminderTemplateName, cloudApi.languageCode || "en_US", [
        name || "Customer",
        inr(due),
      ]);
      await logWhatsAppSend(supabase, { messageType: "payment_reminder", toMobile, waMessageId, status: "sent" });
      sent++;
    } catch (e) {
      await logWhatsAppSend(supabase, { messageType: "payment_reminder", toMobile, status: "failed", error: e instanceof Error ? e.message : String(e) });
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, eligible: dueByMobile.size });
}
