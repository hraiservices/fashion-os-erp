import { istDateString } from "@/lib/ist-date";
import { OPEN_STAGES, stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";

/** Excel/CSV import + export shape for leads. Pure functions so they can be unit-tested. */

export const LEAD_IMPORT_COLUMNS = ["Name", "Mobile", "What they want", "Expected ₹", "Source", "Owner", "Stage", "Likely to close", "Notes"] as const;

export const LEAD_IMPORT_MAX_ROWS = 1000;

export interface ImportLeadRow {
  name: string;
  mobile: string;
  productInterest: string;
  expectedValue: number;
  source: string;
  /** Owner as typed in the sheet (a staff name); resolved on the server. */
  owner: string;
  /** One of the open stage keys, or "" when the column was blank/unknown. */
  stage: string;
  likelyToClose: boolean | null;
  notes: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹]+/g, "");

const ALIASES: Record<keyof ImportLeadRow, string[]> = {
  name: ["name", "leadname", "customername", "customer", "person"],
  mobile: ["mobile", "mobileno", "mobilenumber", "phone", "phoneno", "phonenumber", "contact", "whatsapp"],
  productInterest: ["whattheywant", "product", "productinterest", "interest", "requirement", "item", "wants"],
  expectedValue: ["expected₹", "expected", "expectedamount", "expectedvalue", "amount", "value", "budget", "₹"],
  source: ["source", "leadsource", "wherefrom", "camefrom"],
  owner: ["owner", "assignedto", "salesperson", "staff", "handledby"],
  stage: ["stage", "status"],
  likelyToClose: ["likelytoclose", "likely", "star", "hot"],
  notes: ["notes", "note", "remarks", "comment", "comments"],
};

function pick(row: Record<string, unknown>, field: keyof ImportLeadRow): unknown {
  const wanted = new Set(ALIASES[field]);
  for (const [k, v] of Object.entries(row)) if (wanted.has(norm(k))) return v;
  return undefined;
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0;
  const n = parseFloat(str(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Excel often stores 9876543210 as a number; keep the digits exactly as a string. */
function toMobile(v: unknown): string {
  if (typeof v === "number") return String(Math.round(v));
  return str(v);
}

/** A stage typed as a key ("quoted") or as the shop's label ("Quote sent"). Won/Lost can't be imported — returns "". */
export function resolveImportStage(value: string, labels?: StageLabelOverrides): string {
  const v = norm(value);
  if (!v) return "";
  for (const s of OPEN_STAGES) if (norm(s) === v || norm(stageLabel(s, labels)) === v) return s;
  return "";
}

function toLikely(v: unknown): boolean | null {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (["yes", "y", "true", "1", "star", "★", "likely"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

export function parseImportRow(raw: Record<string, unknown>, labels?: StageLabelOverrides): ImportLeadRow {
  return {
    name: str(pick(raw, "name")),
    mobile: toMobile(pick(raw, "mobile")),
    productInterest: str(pick(raw, "productInterest")),
    expectedValue: toNumber(pick(raw, "expectedValue")),
    source: str(pick(raw, "source")),
    owner: str(pick(raw, "owner")),
    stage: resolveImportStage(str(pick(raw, "stage")), labels),
    likelyToClose: toLikely(pick(raw, "likelyToClose")),
    notes: str(pick(raw, "notes")),
  };
}

/** The row an Excel export writes for one lead — same columns as the import template, plus read-only extras. */
export function exportRowForLead(
  lead: { name: string; mobile: string; productInterest: string; expectedValue: number; source: string; stage: string; likelyToClose: boolean; notes: string; wonValue: number; lostReason: string; createdAt: string },
  ownerName: string,
  labels?: StageLabelOverrides
): Record<string, string | number> {
  return {
    Name: lead.name,
    Mobile: lead.mobile,
    "What they want": lead.productInterest,
    "Expected ₹": lead.expectedValue,
    Source: lead.source,
    Owner: ownerName,
    Stage: stageLabel(lead.stage, labels),
    "Likely to close": lead.likelyToClose ? "Yes" : "No",
    Notes: lead.notes,
    "Won value": lead.stage === "won" ? lead.wonValue : "",
    "Why lost": lead.stage === "lost" ? lead.lostReason : "",
    "Added on": istDateString(new Date(lead.createdAt)),
  };
}
