// Ported from Stitching_Manager_Pro_v16.html ~lines 2024-2045 (global measurement helpers).
import type { Json } from "@/lib/supabase/database.types";

/** Canonical key format: lowercase + spaces→underscores ("Front Neck" → "front_neck"). */
export function toMKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "_");
}

/**
 * Normalises stored measurement data so legacy camelCase keys (frontNeck) also resolve
 * against snake_case field keys (front_neck). Both forms are kept so old and new orders
 * read correctly — do not "clean this up" by dropping the original key.
 */
export function normMeas(m: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(m || {}).forEach((k) => {
    const v = m![k];
    const val = v == null ? "" : String(v);
    out[k] = val;
    out[k.replace(/([A-Z])/g, "_$1").toLowerCase()] = val;
  });
  return out;
}

/** Standard Indian tailoring measurement labels (canonical list). */
export const DEF_MF_LABELS = [
  "Length",
  "Breast",
  "Waist",
  "Hip",
  "Sleeve",
  "Golayi",
  "Front Neck",
  "Back Neck",
  "Teera",
  "Mohri",
  "Calf",
  "Thighs",
  "Aasan",
] as const;

/** Hindi labels, keyed by the same canonical snake_case keys. */
export const MFIELDS_HI: Record<string, string> = {
  length: "लंबाई",
  breast: "छाती",
  waist: "कमर",
  hip: "हिप",
  sleeve: "बाजू",
  golayi: "गोलाई",
  front_neck: "आगे गला",
  back_neck: "पीछे गला",
  teera: "तीरा",
  mohri: "मोहरी",
  calf: "पिंडली",
  thighs: "जाँघ",
  aasan: "आसन",
};

export type MeasureLang = "en" | "hi";

/** Resolves the display label for a field in the chosen language, falling back to English. */
export function measureLabel(label: string, lang: MeasureLang): string {
  if (lang === "hi") return MFIELDS_HI[toMKey(label)] || label;
  return label;
}

/** Blank measurement record for a given field list. */
export function blankMeasurements(labels: readonly string[]): Record<string, string> {
  return Object.fromEntries(labels.map((l) => [toMKey(l), ""]));
}

/** Merges stored values over a blank record so every configured field has an entry. */
export function hydrateMeasurements(labels: readonly string[], stored: Record<string, unknown> | null | undefined): Record<string, string> {
  const normalised = normMeas(stored);
  const out = blankMeasurements(labels);
  Object.keys(out).forEach((k) => {
    if (normalised[k]) out[k] = normalised[k];
  });
  return out;
}

/** Drops empty values so we never persist a wall of blank strings. */
export function compactMeasurements(m: Record<string, string>): Record<string, Json> {
  const out: Record<string, Json> = {};
  Object.entries(m).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
  });
  return out;
}

/** True when a measurement record has at least one filled value. */
export function hasMeasurements(m: Record<string, unknown> | null | undefined): boolean {
  return Object.values(m || {}).some((v) => v != null && String(v).trim() !== "");
}
