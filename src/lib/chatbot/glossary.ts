export interface GlossaryEntry {
  term: string;
  meaning: string;
}

/**
 * Business-vocabulary clarifications for the AI Copilot's SQL generation, editable from
 * Settings → AI Copilot. Seeded with the terms already found to trip up the model — an
 * admin can add more here any time a question gets misread, without needing a code change.
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  {
    term: "stitching orders / tailoring orders",
    meaning:
      "The generic name for every row in the orders table — this is the business line name (custom tailoring), not a status filter. \"Show stitching orders\" means ALL orders, no status filter. Only filter by status='stitching' when the question is clearly about the pipeline stage, e.g. \"orders currently being stitched\".",
  },
];
