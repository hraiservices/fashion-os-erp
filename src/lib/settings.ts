import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_LOYALTY_CONFIG, type LoyaltyConfig } from "@/lib/business-rules";
import { DEFAULT_GLOSSARY, type GlossaryEntry } from "@/lib/chatbot/glossary";

/** Reads app_settings.value for key "loyalty", falling back to defaults — mirrors DEF_LOYALTY merge. */
export async function getLoyaltyConfig(supabase: SupabaseClient<Database>): Promise<LoyaltyConfig> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "loyalty").maybeSingle();
  if (!data?.value || typeof data.value !== "object") return DEFAULT_LOYALTY_CONFIG;
  return { ...DEFAULT_LOYALTY_CONFIG, ...(data.value as Partial<LoyaltyConfig>) };
}

export interface Shop {
  name?: string;
  phone?: string;
}

/** Reads app_settings.value for key "shop" (shopName/phone), used for WhatsApp templates. */
export async function getShopSettings(supabase: SupabaseClient<Database>): Promise<Shop> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  if (!data?.value || typeof data.value !== "object") return {};
  const v = data.value as Record<string, unknown>;
  return { name: typeof v.shopName === "string" ? v.shopName : undefined, phone: typeof v.phone === "string" ? v.phone : undefined };
}

/** Reads app_settings.value for key "chatbotGlossary" — admin-editable business-vocabulary clarifications for the AI Copilot's SQL generation. */
export async function getChatbotGlossary(supabase: SupabaseClient<Database>): Promise<GlossaryEntry[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "chatbotGlossary").maybeSingle();
  if (!Array.isArray(data?.value)) return DEFAULT_GLOSSARY;
  return data.value as unknown as GlossaryEntry[];
}
