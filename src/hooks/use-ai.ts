import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { orderRisks, type OrderRisk } from "@/lib/order-risk";
import { addDaysIso } from "@/lib/work-tasks";
import { DEFAULT_AI_CONFIG, aiFeatureOn, cleanAiConfig, type AiAssistConfig, type AiFeature } from "@/lib/ai-config";

/** Hooks for the AI helpers. Every call goes to a server route that checks the admin's switches and the daily cap. */

async function post<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The AI helper couldn't answer just now");
  return body as T;
}

export interface AiConfigResponse {
  config: AiAssistConfig;
  used: number;
  keyConfigured: boolean;
}

export function useAiConfig() {
  return useQuery({
    queryKey: ["ai-config"],
    queryFn: async (): Promise<AiConfigResponse> => {
      const res = await fetch("/api/settings/ai-assist");
      if (!res.ok) return { config: DEFAULT_AI_CONFIG, used: 0, keyConfigured: false };
      const body = (await res.json().catch(() => null)) as Partial<AiConfigResponse> | null;
      // A page that shows AI buttons must never crash on an odd response — treat it as "AI off".
      return { config: cleanAiConfig(body?.config), used: Number(body?.used) || 0, keyConfigured: !!body?.keyConfigured };
    },
    staleTime: 60_000,
  });
}

/** True once an admin has switched the feature on — buttons for it stay hidden otherwise. */
export function useAiOn(feature: AiFeature): boolean {
  const { data } = useAiConfig();
  return !!data && aiFeatureOn(data.config, feature);
}

export function useSaveAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: AiAssistConfig) => post<{ ok: true }>("/api/settings/ai-assist", config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-config"] }),
  });
}

// ── Lead helpers ──────────────────────────────────────────────────────────
export interface LeadBrief {
  summary: string;
  occasion: string;
  budget: string;
  taste: string;
  objections: string[];
  nextStep: string;
}
export interface LeadReply {
  text: string;
}
export interface GarmentSpec {
  garment: string;
  neckline: string;
  sleeves: string;
  fabric: string;
  work: string;
  colours: string[];
  notes: string;
  rateCardType: string | null;
}
export interface LeadQuote {
  items: { type: string; qty: number; price: number }[];
  total: number;
  deliveryDays: number;
  fitsDeadline: boolean | null;
  notes: string;
}
export interface VoiceSummary {
  transcript: string;
  summary: string;
  actions: string[];
}

export type LeadAiRequest =
  | { action: "brief" }
  | { action: "reply"; intent?: string }
  | { action: "quote" }
  | { action: "spec"; attachmentId: string }
  | { action: "voice"; attachmentId: string };

export function useLeadAi<T>(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: LeadAiRequest) => post<T>(`/api/targets/leads/${leadId}/ai`, req),
    onSuccess: (_d, req) => {
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      if (req.action === "voice") qc.invalidateQueries({ queryKey: ["targets", "lead", leadId] });
    },
  });
}

// ── Tasks, plan, insights, nudge ──────────────────────────────────────────
export interface TaskProposal {
  title: string;
  description: string;
  dueDate: string | null;
}
export const useTasksFromText = () => useMutation({ mutationFn: (text: string) => post<{ tasks: TaskProposal[] }>("/api/targets/ai/tasks-from-text", { text }) });

export interface PlanItem {
  name: string;
  why: string;
  stage: string;
  heat: string;
  value: number;
}
export const useDailyPlan = () => useMutation({ mutationFn: (payload: { items: PlanItem[]; risks: string[] }) => post<{ plan: string[] }>("/api/targets/ai/plan", payload) });

export interface InsightsResult {
  headline: string;
  bullets: string[];
  coaching: { name: string; tip: string }[];
}
export const useInsights = () => useMutation({ mutationFn: (range?: { from: string; to: string }) => post<InsightsResult>("/api/targets/ai/insights", range ?? {}) });

export interface NudgeCustomer {
  name: string;
  mobile: string;
  lastOrder: string;
  spent: number;
}
export interface NudgeResult {
  festival: { name: string; date: string; daysAway: number } | null;
  message: string;
  aiDrafted: boolean;
  customers: NudgeCustomer[];
}
export function useNudge(enabled: boolean) {
  return useQuery({
    queryKey: ["ai-nudge"],
    enabled,
    queryFn: async (): Promise<NudgeResult> => {
      const res = await fetch("/api/targets/ai/nudge");
      if (!res.ok) throw new Error("Couldn't load the festival list");
      return res.json();
    },
    staleTime: 6 * 60 * 60_000,
  });
}

// ── Orders at risk (plain rules, no AI) ───────────────────────────────────
export function useOrderRisks(today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["order-risks", today],
    enabled: enabled && !!today,
    queryFn: async (): Promise<OrderRisk[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select("id, name, status, delivery_date")
        .in("status", ["received", "cutting", "stitching", "finishing", "ready"])
        .lte("delivery_date", addDaysIso(today, 10))
        .order("delivery_date")
        .limit(300);
      if (error || !data) return [];
      return orderRisks(data, today);
    },
    staleTime: 5 * 60_000,
  });
}
