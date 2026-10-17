import { NextResponse } from "next/server";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { enquirySchema } from "@/lib/enquiry";
import { isOpenStage } from "@/lib/lead-stages";
import { createServiceClient } from "@/lib/supabase/service";
import { isRealDate } from "@/lib/targets-api";

/**
 * Public enquiry form (QR on the counter, Instagram bio, WhatsApp status). Anyone can post here, so it is deliberately small:
 * a honeypot field, a per-address rate limit, and it only ever creates a lead or adds a note to an existing open lead.
 */

const hits = new Map<string, number[]>();
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 5;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

/** GET — just the shop's name for the form heading. */
export async function GET() {
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ shopName: "" });
  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const name = (data?.value as { name?: string } | null)?.name;
  return NextResponse.json({ shopName: typeof name === "string" ? name : "" });
}

export async function POST(request: Request) {
  const parsed = enquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the form" }, { status: 400 });
  const d = parsed.data;
  // A filled honeypot is a bot: answer as if it worked so it learns nothing.
  if (d.website) return NextResponse.json({ ok: true });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) return NextResponse.json({ error: "Too many requests — please try again later, or message us on WhatsApp." }, { status: 429 });

  const mobile = normalizeIndianMobile(d.mobile);
  if (mobile.length < 10) return NextResponse.json({ error: "That mobile number doesn't look right" }, { status: 400 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "We couldn't take your enquiry right now — please call or message us." }, { status: 501 });

  const noteBits = [d.looking && `Looking for: ${d.looking}`, d.neededBy && `Needed by: ${d.neededBy}`, d.message && `Message: ${d.message}`].filter(Boolean).join(" · ");
  const body = `Enquiry form (${d.source})${noteBits ? ` — ${noteBits}` : ""}`.slice(0, 1000);

  const { data: existing } = await serviceClient.from("leads").select("id, stage").eq("mobile", mobile).order("updated_at", { ascending: false }).limit(5);
  let leadId = (existing || []).find((l) => isOpenStage(l.stage))?.id;
  if (leadId) {
    await serviceClient.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
  } else {
    const { data: created, error } = await serviceClient
      .from("leads")
      .insert({
        name: d.name,
        mobile,
        source: d.source,
        product_interest: d.looking,
        notes: d.message.slice(0, 1000),
        created_by: "enquiry-form",
        ...(d.neededBy && isRealDate(d.neededBy) ? { needed_by: d.neededBy } : {}),
      })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "We couldn't save your enquiry — please call or message us." }, { status: 500 });
    leadId = created.id;
  }
  await serviceClient.from("lead_activities").insert({ lead_id: leadId, kind: "note", body, created_by: "enquiry-form" });
  await serviceClient.from("admin_notifications").insert({ type: "new_enquiry", customer_name: d.name, message: `New enquiry from ${d.name} (${d.source})${d.looking ? `: ${d.looking}` : ""}`, read: false });
  return NextResponse.json({ ok: true });
}
