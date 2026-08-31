import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { sendWhatsAppTemplateText, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { logWhatsAppSend } from "@/lib/whatsapp-log";

const bodySchema = z.object({
  tags: z.array(z.string()).min(1, "Pick at least one tag"),
  message: z.string().min(1).max(900),
});

/**
 * Sends one message to every customer carrying ANY of the given tags — the segment mechanism
 * is deliberately just the existing customers.tags array (VIP, At-Risk, ...), not a new concept.
 * Respects whatsapp_opt_out per customer and needs its own approved Meta template (2 body
 * parameters: customer name, message text) since this is a proactive, shop-initiated send.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to message customers" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { tags, message } = parsed.data;

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { data: cloudApiSetting } = await serviceClient.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle();
  const cloudApi = cloudApiSetting?.value as WhatsAppCloudApiConfig | null;
  if (!cloudApi?.phoneNumberId || !cloudApi?.accessToken || !cloudApi?.broadcastTemplateName) {
    return NextResponse.json({ error: "Set up the Broadcast template under Settings → WhatsApp first" }, { status: 400 });
  }

  const { data: customers, error } = await supabase.from("customers").select("name, mobile, whatsapp_opt_out").overlaps("tags", tags);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (customers || []).filter((c) => !c.whatsapp_opt_out);
  if (targets.length === 0) return NextResponse.json({ sent: 0, skipped: 0, total: 0 });

  let sent = 0;
  let failed = 0;
  for (const c of targets) {
    const toMobile = `91${normalizeIndianMobile(c.mobile)}`;
    try {
      const waMessageId = await sendWhatsAppTemplateText(cloudApi, toMobile, cloudApi.broadcastTemplateName, cloudApi.languageCode || "en_US", [
        c.name || "Customer",
        message,
      ]);
      await logWhatsAppSend(supabase, { messageType: "broadcast", toMobile, waMessageId, status: "sent" });
      sent++;
    } catch (e) {
      await logWhatsAppSend(supabase, { messageType: "broadcast", toMobile, status: "failed", error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: targets.length });
}
