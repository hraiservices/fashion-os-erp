import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_RECOMMENDATION_TEMPLATE, renderRecommendationMessage, buildRecommendationWaUrl } from "@/lib/recommendation-whatsapp";
import { isCloudApiConfigured, sendWhatsAppTemplateMessage, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { logWhatsAppSend } from "@/lib/whatsapp-log";
import { normalizeIndianMobile } from "@/lib/business-rules";

const bodySchema = z.object({
  mobile: z.string().min(1),
  customerName: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  category: z.string().optional().default(""),
  price: z.number().default(0),
  score: z.number().default(0),
});

const DEFAULT_COOLDOWN_DAYS = 14;

/**
 * Anti-spam gate (Section 19 of the feature spec) + logging for Customer Purchase
 * Intelligence recommendations. Refuses to re-suggest the SAME product to the SAME customer
 * within the cooldown window, regardless of who's clicking send — this is enforced
 * server-side so it can't be bypassed by refreshing/retrying client-side.
 *
 * On success, returns a wa.me composer URL (the only channel this app can send through
 * today — see recommendation-whatsapp.ts). The actual "send" still happens in the merchant's
 * own browser/WhatsApp Web; this endpoint's job is the cooldown check + audit log entry.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to message customers" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  // whatsappCloudApiConfig holds a live Meta API access token and its SELECT is blocked for the
  // `authenticated` role (lockdown_whatsapp_cloud_api_config.sql) — read it via the service-role
  // client, which bypasses RLS, rather than the session client every other read here uses.
  const serviceClient = createServiceClient();
  const [{ data: cooldownSetting }, { data: templateSetting }, cloudApiResult, { data: productRow }, { data: customerRow }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "recommendationCooldownDays").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "recommendationWhatsAppTemplate").maybeSingle(),
    serviceClient
      ? serviceClient.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("products").select("image_data_url").eq("id", fd.productId).maybeSingle(),
    supabase.from("customers").select("whatsapp_opt_out").eq("mobile", fd.mobile).maybeSingle(),
  ]);
  const cloudApiSetting = cloudApiResult?.data;
  const cooldownDays = typeof cooldownSetting?.value === "number" ? cooldownSetting.value : DEFAULT_COOLDOWN_DAYS;
  const template = typeof templateSetting?.value === "string" ? templateSetting.value : DEFAULT_RECOMMENDATION_TEMPLATE;

  if (customerRow?.whatsapp_opt_out) {
    return NextResponse.json({ blocked: true, reason: "opted_out" }, { status: 409 });
  }

  const cutoff = new Date(Date.now() - cooldownDays * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("customer_recommendations")
    .select("created_at")
    .eq("customer_mobile", fd.mobile)
    .eq("product_id", fd.productId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    return NextResponse.json({ blocked: true, lastSentAt: recent.created_at, cooldownDays }, { status: 409 });
  }

  const message = renderRecommendationMessage(template, {
    customerName: fd.customerName,
    productName: fd.productName,
    category: fd.category,
    price: fd.price,
  });

  // Try the Business Cloud API first if the shop has configured it (real send, no manual tap
  // needed). Falls back to the wa.me composer on any failure — misconfigured credentials, an
  // unapproved template, or simply not having set it up at all — so a broken/unset Cloud API
  // config never blocks the merchant from messaging a customer.
  const cloudApiConfig = cloudApiSetting?.value as Partial<WhatsAppCloudApiConfig> | undefined;
  if (isCloudApiConfigured(cloudApiConfig)) {
    try {
      const origin = new URL(request.url).origin;
      const imageUrl = productRow?.image_data_url ? `${origin}/api/products/${fd.productId}/image` : undefined;
      const toMobile = `91${normalizeIndianMobile(fd.mobile)}`;
      const waMessageId = await sendWhatsAppTemplateMessage({
        config: cloudApiConfig,
        toMobile,
        customerName: fd.customerName,
        productName: fd.productName,
        price: String(fd.price),
        imageUrl,
      });
      await logWhatsAppSend(supabase, { messageType: "recommendation", toMobile, waMessageId, status: "sent" });
      await supabase.from("customer_recommendations").insert({
        customer_mobile: fd.mobile,
        customer_name: fd.customerName,
        product_id: fd.productId,
        product_name: fd.productName,
        score: Math.round(fd.score),
        channel: "whatsapp_api",
        message,
        created_by: user.email,
      });
      return NextResponse.json({ blocked: false, sentViaApi: true, message });
    } catch (e) {
      // Fall through to wa.me below — logged so the failure is visible, but not fatal.
      console.error("WhatsApp Cloud API send failed, falling back to wa.me:", e instanceof Error ? e.message : e);
      await logWhatsAppSend(supabase, {
        messageType: "recommendation",
        toMobile: `91${normalizeIndianMobile(fd.mobile)}`,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const waUrl = buildRecommendationWaUrl(fd.mobile, template, {
    customerName: fd.customerName,
    productName: fd.productName,
    category: fd.category,
    price: fd.price,
  });

  const { error } = await supabase.from("customer_recommendations").insert({
    customer_mobile: fd.mobile,
    customer_name: fd.customerName,
    product_id: fd.productId,
    product_name: fd.productName,
    score: Math.round(fd.score),
    channel: "wa_me",
    message,
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ blocked: false, waUrl, message });
}
