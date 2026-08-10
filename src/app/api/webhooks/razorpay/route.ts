import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_ENTITLEMENTS, type ModuleEntitlements } from "@/lib/entitlements";

// @react-pdf/renderer isn't involved here, but signature verification needs Node's `crypto`
// module — not available on the Edge runtime.
export const runtime = "nodejs";

const CHARGED_EVENTS = new Set(["subscription.charged", "subscription.activated"]);

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Razorpay subscription webhook — the only way `moduleEntitlements.billing` gets updated
 * without you manually editing Settings > Module Licensing. Runs with no logged-in session
 * (Razorpay calls this directly), so it uses the service-role client — same pattern as the
 * cron routes (src/app/api/ai/daily-briefing/route.ts) — rather than the set_module_entitlements
 * RPC, which requires a real user JWT to check against the owner email.
 *
 * Deliberately does NOT clear `paidUntil` on a cancelled/halted event — a transient or
 * retriable payment failure shouldn't yank access instantly; the date already on file lapsing
 * naturally is the actual enforcement moment, consistent with "soft, no hard-blocking"
 * everywhere else in this licensing system. Halted events are still logged for visibility.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "RAZORPAY_WEBHOOK_SECRET is not configured." }, { status: 501 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(payload.event || "unknown");

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 501 });

  await supabase.from("billing_events").insert({ event_type: eventType, razorpay_payload: payload as never });

  if (CHARGED_EVENTS.has(eventType)) {
    const subEntity = (payload.payload as { subscription?: { entity?: Record<string, unknown> } } | undefined)?.subscription?.entity;
    const subscriptionId = (subEntity?.id as string | undefined) || null;
    const currentEndUnix = subEntity?.current_end as number | undefined;
    const paidUntil = currentEndUnix
      ? new Date(currentEndUnix * 1000).toISOString().slice(0, 10)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: settingRow } = await supabase.from("app_settings").select("value").eq("key", "moduleEntitlements").maybeSingle();
    const current = (settingRow?.value as ModuleEntitlements | null) || DEFAULT_ENTITLEMENTS;

    const next: ModuleEntitlements = {
      ...current,
      billing: {
        ...current.billing,
        paidUntil,
        lastPaymentAt: new Date().toISOString(),
        razorpaySubscriptionId: subscriptionId || current.billing?.razorpaySubscriptionId || null,
      },
    };

    const { error } = await supabase.from("app_settings").upsert({ key: "moduleEntitlements", value: next as never });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Halted/cancelled and any other event types are already logged to billing_events above and
  // otherwise ignored — see the function doc comment for why halts don't clear paidUntil.

  return NextResponse.json({ received: true });
}
