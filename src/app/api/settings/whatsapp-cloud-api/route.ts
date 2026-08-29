import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const configSchema = z.object({
  phoneNumberId: z.string().default(""),
  accessToken: z.string().default(""),
  templateName: z.string().default(""),
  languageCode: z.string().default(""),
  appSecret: z.string().default(""),
  verifyToken: z.string().default(""),
  conciergeEnabled: z.boolean().default(false),
  briefingTemplateName: z.string().default(""),
  readyTemplateName: z.string().default(""),
  paymentReminderTemplateName: z.string().default(""),
});

/**
 * The only sanctioned way to read/write the whatsappCloudApiConfig app_settings key, which
 * stores a live Meta WhatsApp Business Cloud API access token in plaintext.
 *
 * Every other app_settings key is readable/writable by any authenticated user through
 * useAppSetting()'s direct client-side Supabase calls — fine for shop name, message templates,
 * etc., but this key is a real third-party credential: any logged-in user (any role) could
 * previously run `supabase.from('app_settings').select('value').eq('key',
 * 'whatsappCloudApiConfig')` from the browser console and read out a usable Meta API token, or
 * overwrite it to hijack/break outbound customer messaging. lockdown_whatsapp_cloud_api_config.sql
 * now blocks direct SELECT/INSERT/UPDATE on this specific key for `authenticated`; only this
 * route (admin-gated, matching the settings page's own SettingsGuard) can reach it, via the
 * service-role client.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle();
  return NextResponse.json({ value: data?.value ?? null });
}

export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = configSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { error } = await serviceClient.from("app_settings").upsert({ key: "whatsappCloudApiConfig", value: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
