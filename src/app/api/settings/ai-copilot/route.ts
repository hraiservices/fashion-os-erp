import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const configSchema = z.object({ apiKey: z.string().default("") });

/**
 * The only sanctioned way to read/write the geminiApiKeyConfig app_settings key — see
 * lockdown_gemini_api_key_config.sql. GET never returns the actual key value, only whether one
 * is set, so the Settings page can show "configured" without the key round-tripping to every
 * admin's browser on every page load.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "geminiApiKeyConfig").maybeSingle();
  const config = data?.value as { apiKey?: string } | null;
  return NextResponse.json({ configured: !!config?.apiKey, usingEnvVar: !!process.env.GEMINI_API_KEY });
}

export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = configSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { error } = await serviceClient.from("app_settings").upsert({ key: "geminiApiKeyConfig", value: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
