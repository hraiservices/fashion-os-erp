import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWhatsAppTextMessage, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { generateConciergeReply } from "@/lib/chatbot/gemini";

/**
 * Meta WhatsApp Business Cloud API webhook — receives inbound customer messages and replies
 * with a read-only summary of THAT customer's own recent stitching orders (status, delivery
 * date, balance due). Never changes any data, never books/reschedules anything, and never
 * queries or mentions any other customer's records — see generateConciergeReply's doc comment
 * for how the "only this customer's data" guarantee is enforced (a plain SQL WHERE, not an
 * LLM-generated query).
 *
 * Like the rest of whatsapp-cloud-api.ts, this cannot be exercised end-to-end without a real
 * Meta WhatsApp Business Account, App Secret, and a webhook URL registered in Meta's App
 * Dashboard (Settings → Personalize's WhatsApp Cloud API config, "appSecret"/"verifyToken"/
 * "conciergeEnabled" fields) — treat as unverified until tested against a live account.
 */

type ConciergeConfig = WhatsAppCloudApiConfig;

async function loadConfig(): Promise<{ config: ConciergeConfig | null; serviceClient: ReturnType<typeof createServiceClient> }> {
  const serviceClient = createServiceClient();
  if (!serviceClient) return { config: null, serviceClient: null };
  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle();
  return { config: (data?.value as ConciergeConfig | null) ?? null, serviceClient };
}

/** Meta's one-time webhook verification handshake — confirms this URL really belongs to the
 *  shop that configured it, by requiring the same verifyToken entered in both places. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const { config } = await loadConfig();
  if (mode === "subscribe" && token && config?.verifyToken && token === config.verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Indian mobile numbers are stored locally as bare 10-digit strings (see orders.mobile), but
 *  WhatsApp's `wa_id` includes the country code (e.g. "919876543210") — strip to the last 10
 *  digits so it matches what's actually in the database. */
function normalizeMobile(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

interface InboundMessage {
  from: string;
  text: string;
}

/** Best-effort extraction from Meta's deeply-nested webhook payload — returns null for
 *  anything that isn't a plain inbound text message (status callbacks, media messages, the
 *  shop's own outbound echoes, etc. are all silently ignored). */
function extractInboundMessage(payload: unknown): InboundMessage | null {
  try {
    const entry = (payload as { entry?: unknown[] })?.entry?.[0] as { changes?: unknown[] } | undefined;
    const change = entry?.changes?.[0] as { value?: { messages?: unknown[] } } | undefined;
    const message = change?.value?.messages?.[0] as { from?: string; type?: string; text?: { body?: string } } | undefined;
    if (!message?.from || message.type !== "text" || !message.text?.body) return null;
    return { from: message.from, text: message.text.body };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const { config, serviceClient } = await loadConfig();

  // Silently ack (200) rather than error whenever the feature just isn't set up — Meta retries
  // aggressively on non-2xx responses, and "not configured"/"disabled" isn't a delivery failure.
  if (!serviceClient || !config?.conciergeEnabled || !config.appSecret || !config.phoneNumberId || !config.accessToken) {
    return NextResponse.json({ ok: true });
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, config.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const inbound = extractInboundMessage(payload);
  if (!inbound) return NextResponse.json({ ok: true });

  const mobile = normalizeMobile(inbound.from);

  try {
    const { data: orders } = await serviceClient
      .from("orders")
      .select("id, status, delivery_date, total, balance")
      .eq("mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(5);

    const reply = await generateConciergeReply(inbound.text, orders || []);
    await sendWhatsAppTextMessage(config, inbound.from, reply);
  } catch (e) {
    // Never surface this to Meta as a webhook failure (it'll just retry the same message) —
    // log-and-swallow is the right behavior for a best-effort customer reply.
    console.error("WhatsApp concierge reply failed:", e);
  }

  return NextResponse.json({ ok: true });
}
