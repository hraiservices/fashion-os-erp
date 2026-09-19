import { createServiceClient } from "@/lib/supabase/service";

export interface AnthropicConfig {
  apiKey: string;
}

export const BLANK_ANTHROPIC_CONFIG: AnthropicConfig = { apiKey: "" };

/**
 * The Claude (Anthropic) API key the AI Copilot's Q&A engine runs on (src/lib/chatbot/claude.ts).
 * Mirrors resolveGeminiApiKey() exactly — same env-var-first, then Settings-stored fallback, so
 * an admin can fix a missing/expired key themselves without a redeploy. Everything else that
 * still runs on Gemini (daily briefing, voice transcription, measurement-photo reading) keeps
 * using resolveGeminiApiKey() unchanged.
 */
export async function resolveAnthropicApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const serviceClient = createServiceClient();
  if (!serviceClient) return null;
  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "anthropicApiKeyConfig").maybeSingle();
  const config = data?.value as Partial<AnthropicConfig> | null;
  return config?.apiKey?.trim() || null;
}
