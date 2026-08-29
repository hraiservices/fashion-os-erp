import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchWhatsAppTemplates, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";

/** Lists this shop's approved Meta message templates, for the settings UI's template-name
 *  dropdowns. Same admin gate + service-role read as the parent whatsapp-cloud-api route,
 *  since this also touches the stored access token. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle();
  const config = data?.value as WhatsAppCloudApiConfig | null;
  if (!config?.wabaId || !config?.accessToken) {
    return NextResponse.json({ error: "Set the WhatsApp Business Account ID and Access Token first" }, { status: 400 });
  }

  try {
    const templates = await fetchWhatsAppTemplates(config);
    return NextResponse.json({ templates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't fetch templates from Meta" }, { status: 500 });
  }
}
