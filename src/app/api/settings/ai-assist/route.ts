import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveGeminiApiKey } from "@/lib/gemini-config";
import { aiUsageToday, loadAiConfig } from "@/lib/ai-assist";
import { AI_CONFIG_KEY, AI_FEATURES, cleanAiConfig, type AiFeature } from "@/lib/ai-config";

const featureShape = Object.fromEntries((Object.keys(AI_FEATURES) as AiFeature[]).map((k) => [k, z.boolean().optional()]));
const schema = z.object({ enabled: z.boolean(), dailyCap: z.number().int().min(1).max(5000), features: z.object(featureShape).partial() });

/** GET — the AI helper switches, today's usage, and whether a Gemini key exists. Any signed-in user (the buttons need to know if AI is on). */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });
  const [config, used, key] = await Promise.all([loadAiConfig(serviceClient), aiUsageToday(serviceClient), resolveGeminiApiKey()]);
  return NextResponse.json({ config, used, keyConfigured: !!key });
}

/** POST — admins only. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });
  const { error } = await serviceClient.from("app_settings").upsert({ key: AI_CONFIG_KEY, value: JSON.parse(JSON.stringify(cleanAiConfig(parsed.data))) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
