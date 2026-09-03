import { createServiceClient } from "@/lib/supabase/service";

export interface GeminiConfig {
  apiKey: string;
}

export const BLANK_GEMINI_CONFIG: GeminiConfig = { apiKey: "" };

/**
 * The Gemini API key AI Copilot (and the daily briefing, voice transcription, and measurement
 * photo extraction — everything in src/lib/chatbot/gemini.ts) actually runs on.
 *
 * Previously this was ONLY process.env.GEMINI_API_KEY — if a deployment never had that
 * environment variable set (easy to miss; it's not asked for anywhere in the app's own setup),
 * every single AI Copilot question failed identically with a generic "I couldn't find an
 * answer," which reads as "the AI is broken" rather than "it's not configured." Now falls back
 * to a key entered in Settings → AI Copilot (stored like whatsappCloudApiConfig — see
 * lockdown_gemini_api_key_config.sql for why this needs its own read/write lockdown), so a shop
 * owner can fix this themselves without a redeploy or even knowing what an env var is.
 */
export async function resolveGeminiApiKey(): Promise<string | null> {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  const serviceClient = createServiceClient();
  if (!serviceClient) return null;
  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "geminiApiKeyConfig").maybeSingle();
  const config = data?.value as Partial<GeminiConfig> | null;
  return config?.apiKey?.trim() || null;
}
