import crypto from "crypto";
import { NextResponse } from "next/server";
import { isOpenStage } from "@/lib/lead-stages";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Instagram / Facebook Page direct messages → leads. INACTIVE until these three environment variables are set:
 *   META_SOCIAL_VERIFY_TOKEN  (any string you also type into Meta's webhook setup)
 *   META_SOCIAL_APP_SECRET    (Meta app secret — checks each request really came from Meta)
 *   META_SOCIAL_PAGE_TOKEN    (Page access token with messaging permission — used to read the sender's name)
 * Instagram and Facebook do not reveal a phone number, so the lead is created without one; staff ask for it in the chat.
 * Like the WhatsApp capture this cannot be exercised without a real Meta app — treat it as untested until tried live.
 */

const verifyOk = (raw: string, header: string | null, secret: string) => {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.slice(7);
  return expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
};

/** Meta's one-time handshake. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.META_SOCIAL_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new NextResponse(url.searchParams.get("hub.challenge") || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

interface Messaging {
  sender?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

export async function POST(request: Request) {
  const secret = process.env.META_SOCIAL_APP_SECRET;
  const pageToken = process.env.META_SOCIAL_PAGE_TOKEN;
  // Not set up: acknowledge so Meta does not keep retrying, and do nothing.
  if (!secret || !pageToken || !process.env.META_SOCIAL_VERIFY_TOKEN) return NextResponse.json({ ok: true });

  const raw = await request.text();
  if (!verifyOk(raw, request.headers.get("x-hub-signature-256"), secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ ok: true });

  let payload: { object?: string; entry?: { messaging?: Messaging[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const source = payload.object === "instagram" ? "Instagram" : "Facebook";

  for (const entry of payload.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      const senderId = m.sender?.id;
      const text = m.message?.text?.trim();
      if (!senderId || !text || m.message?.is_echo) continue;

      if (m.message?.mid) {
        const { error: dupe } = await serviceClient.from("whatsapp_inbound_dedup").insert({ wa_message_id: `meta:${m.message.mid}` });
        if (dupe?.code === "23505") continue;
      }

      try {
        const marker = `[social:${senderId}]`;
        const { data: found } = await serviceClient.from("leads").select("id, stage").ilike("notes", `%${marker}%`).order("updated_at", { ascending: false }).limit(5);
        let leadId = (found || []).find((l) => isOpenStage(l.stage))?.id;
        if (!leadId) {
          let name = `${source} enquiry`;
          try {
            const res = await fetch(`https://graph.facebook.com/v21.0/${senderId}?fields=name,username&access_token=${encodeURIComponent(pageToken)}`);
            if (res.ok) {
              const p = (await res.json()) as { name?: string; username?: string };
              name = p.name || p.username || name;
            }
          } catch {
            /* the generic name is fine */
          }
          const { data: created } = await serviceClient.from("leads").insert({ name, mobile: "", source, notes: marker, created_by: "social-dm" }).select("id").single();
          leadId = created?.id;
          if (leadId) {
            await serviceClient.from("lead_activities").insert({ lead_id: leadId, kind: "note", body: `Lead created from a ${source} message — ask for their mobile number to continue on WhatsApp`, created_by: "social-dm" });
            await serviceClient.from("admin_notifications").insert({ type: "new_enquiry", customer_name: name, message: `New ${source} enquiry from ${name}`, read: false });
          }
        }
        if (leadId) {
          await serviceClient.from("lead_activities").insert({ lead_id: leadId, kind: "note", body: `${source}: ${text}`.slice(0, 1000), created_by: "social-dm" });
          await serviceClient.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
        }
      } catch (e) {
        console.error("Social DM capture failed:", e);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
