/**
 * Lead stages for the Targets module. Keys are fixed (they are stored in the database and used by
 * reports); the labels shown to people can be renamed per shop via the `leadStageLabels` setting.
 * Deliberately plain words — no "pipeline", "qualified", "opportunity".
 */

export const LEAD_STAGES = ["new", "talking", "visit", "quoted", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages a lead moves through before it is decided. */
export const OPEN_STAGES: readonly LeadStage[] = ["new", "talking", "visit", "quoted"];
export const CLOSED_STAGES: readonly LeadStage[] = ["won", "lost"];

export const DEFAULT_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  talking: "Talking",
  visit: "Visit",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export type StageLabelOverrides = Partial<Record<LeadStage, string>>;

export function stageLabel(stage: string, overrides?: StageLabelOverrides | null): string {
  const key = stage as LeadStage;
  // The overrides come from a shop setting anyone signed in could have written to: ignore anything that isn't text.
  const raw = overrides?.[key] as unknown;
  const custom = typeof raw === "string" ? raw.trim() : "";
  return custom || DEFAULT_STAGE_LABELS[key] || stage;
}

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

export function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

export const LEAD_SOURCES = ["Walk-in", "Instagram", "Facebook", "WhatsApp", "Referral", "Phone call", "Website", "Other"] as const;

export const LOST_REASONS = ["Price too high", "Chose another shop", "Not interested now", "No response", "Needed it sooner", "Other"] as const;

/**
 * A stage change is allowed between any two stages (people skip and go back in real life), with
 * one rule: a lead can only be marked Lost with a reason, so the Lost Leads report means something.
 * Returns an error message, or null when the move is fine.
 */
export function validateStageChange(input: { from: string; to: string; lostReason?: string | null }): string | null {
  if (!isLeadStage(input.to)) return "Unknown stage";
  if (input.from === input.to) return null;
  if (input.to === "lost" && !(input.lostReason || "").trim()) return "Pick a reason before marking a lead as Lost";
  return null;
}

/** The value a Won lead is recorded at: what the user entered, else the expected value. */
export function wonValueFor(input: { enteredValue?: number | null; expectedValue: number }): number {
  const entered = Number(input.enteredValue);
  return Number.isFinite(entered) && entered > 0 ? entered : Math.max(0, input.expectedValue || 0);
}
