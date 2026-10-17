/** Admin controls for the AI helpers (Settings → AI Helpers). Pure — safe in client and server code. */

export const AI_FEATURES = {
  brief: "Lead brief",
  reply: "WhatsApp reply drafts",
  spec: "Photo to garment details",
  voice: "Voice-note summary",
  quote: "Smart quote",
  tasks: "Tasks from text",
  plan: "Daily plan",
  insights: "Weekly insights and coaching",
  nudge: "Festival message drafts",
} as const;

export type AiFeature = keyof typeof AI_FEATURES;

export interface AiAssistConfig {
  /** Master switch — off until an admin turns the helpers on (every call spends the shop's Gemini quota). */
  enabled: boolean;
  /** Most AI calls the whole shop may make in a day. */
  dailyCap: number;
  /** Per-feature switches; a feature not listed here follows the master switch. */
  features: Partial<Record<AiFeature, boolean>>;
}

export const DEFAULT_AI_CONFIG: AiAssistConfig = { enabled: false, dailyCap: 200, features: {} };

export const AI_CONFIG_KEY = "aiAssistConfig";
export const AI_USAGE_KEY = "aiAssistUsage";

export function cleanAiConfig(raw: unknown): AiAssistConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AiAssistConfig>;
  const features: AiAssistConfig["features"] = {};
  for (const key of Object.keys(AI_FEATURES) as AiFeature[]) {
    if (typeof r.features?.[key] === "boolean") features[key] = r.features[key];
  }
  const cap = Number(r.dailyCap);
  return { enabled: r.enabled === true, dailyCap: Number.isFinite(cap) ? Math.min(5000, Math.max(1, Math.round(cap))) : DEFAULT_AI_CONFIG.dailyCap, features };
}

export const aiFeatureOn = (config: AiAssistConfig, feature: AiFeature) => config.enabled && config.features[feature] !== false;
