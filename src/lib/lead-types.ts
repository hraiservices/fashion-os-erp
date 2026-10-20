/**
 * Lead Type — a single, shop-editable category per lead (Settings > Leads), so a lead for
 * selling the Fashion Flow app itself, a referral, or a wholesale enquiry can be told apart from
 * the default stitching-customer lead the Leads screen was originally built around. One per
 * lead, not a free tag list: the point is sorting/filtering/reporting, which wants every lead in
 * exactly one bucket, not an open-ended set that can drift into duplicates and typos.
 *
 * The column itself (needs add_lead_type.sql) is always optional on both the DB row and every
 * payload here — a shop that hasn't run the migration, or a lead nobody has typed yet, just has
 * no type, same convention as every other "needs SQL" field in lead-templates.ts /
 * lead-stages.ts.
 */

export const LEAD_TYPE_SETTING_KEY = "leadTypes";

export const DEFAULT_LEAD_TYPES: string[] = ["Stitching Customer", "App Sale (Fashion Flow)", "Referral / Partner", "Wholesale / Bulk"];

export const MAX_LEAD_TYPES = 20;
const MAX_TYPE_LENGTH = 40;

/** Sentinel for "no type set yet" in a filter control — never stored, only used client-side to
 *  ask for leads with lead_type IS NULL (see the report route and the leads list filter). */
export const UNSET_LEAD_TYPE = "__unset__";

/** Does this lead match a `?leadType=` filter value? Empty/missing filter matches everything;
 *  UNSET_LEAD_TYPE matches leads with no type set. Shared by the leads list filter (client-side)
 *  and the Targets reports route (server-side), so the two stay consistent. */
export function matchesLeadTypeFilter(leadType: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === UNSET_LEAD_TYPE) return !leadType;
  return leadType === filter;
}

/** Keeps only well-formed, de-duplicated entries from a stored setting (anyone signed in with
 *  access to Settings can write to it). Falls back to the defaults when nothing usable is left —
 *  an empty list would otherwise silently hide the Type picker everywhere it's used. */
export function cleanLeadTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_LEAD_TYPES;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, MAX_TYPE_LENGTH);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_LEAD_TYPES) break;
  }
  return out.length ? out : DEFAULT_LEAD_TYPES;
}
