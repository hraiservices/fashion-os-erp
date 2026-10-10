import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { OPEN_STAGES } from "@/lib/lead-stages";

/**
 * Works out what a lead import will do — add this lead, update that one, skip this row and say why — without
 * touching the database, so the rules are unit-tested. The import route reads the open leads whose numbers
 * appear in the file, asks this for the plan, then writes it in batches.
 */

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export interface ImportInputRow {
  name: string;
  mobile: string;
  productInterest: string;
  expectedValue: number;
  source: string;
  owner: string;
  stage: string;
  likelyToClose: boolean | null;
  notes: string;
}

/** An open lead that already exists for a number in the file. */
export interface ExistingLead {
  id: string;
  mobile: string;
  assigned_employee_id: string | null;
  created_by: string | null;
}

export interface ImportViewer {
  employeeId: string | null;
  email: string;
  /** Sees everyone's leads. */
  seesAll: boolean;
  /** May give leads to other people. */
  canAssignOthers: boolean;
}

export type ImportOp =
  | { kind: "insert"; rowNo: number; name: string; row: LeadInsert }
  | { kind: "update"; rowNo: number; name: string; id: string; patch: LeadUpdate };

export interface ImportPlan {
  ops: ImportOp[];
  problems: { row: number; message: string }[];
}

/** Open stages only: Won / Lost carry rules (a lost reason, a customer record) that an import must not skip. */
export const importStage = (stage: string): string => ((OPEN_STAGES as readonly string[]).includes(stage) ? stage : "");

/** Fills an update's patch with the columns that were filled in on a sheet row (blank columns change nothing). */
function applyRow(target: LeadUpdate | LeadInsert, r: ImportInputRow, owner: string | null | undefined) {
  target.name = r.name;
  if (r.productInterest) target.product_interest = r.productInterest;
  if (r.expectedValue > 0) target.expected_value = r.expectedValue;
  if (r.source) target.source = r.source;
  if (r.notes) target.notes = r.notes;
  if (importStage(r.stage)) target.stage = r.stage;
  if (r.likelyToClose !== null) target.likely_to_close = r.likelyToClose;
  if (owner !== undefined) target.assigned_employee_id = owner;
}

const mayUse = (lead: ExistingLead, v: ImportViewer) =>
  v.seesAll || (!!v.employeeId && lead.assigned_employee_id === v.employeeId) || (!!lead.created_by && lead.created_by.toLowerCase() === v.email.toLowerCase());

export function planLeadImport(rows: ImportInputRow[], staff: { id: string; name: string }[], existing: ExistingLead[], viewer: ImportViewer, nowIso: string): ImportPlan {
  const byName = new Map<string, string[]>();
  for (const s of staff) {
    const k = s.name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) || []), s.id]);
  }
  const openByMobile = new Map(existing.map((l) => [l.mobile, l]));

  const problems: ImportPlan["problems"] = [];
  const ops: ImportOp[] = [];
  /** A number seen earlier in this same file: later rows with it fill in the same lead instead of repeating it. */
  const byMobile = new Map<string, ImportOp>();

  rows.forEach((r, i) => {
    const rowNo = i + 2; // sheet row: header is row 1
    if (!r.name) {
      problems.push({ row: rowNo, message: "No name — skipped" });
      return;
    }
    const mobile = r.mobile ? normalizeIndianMobile(r.mobile) : "";
    if (r.mobile && mobile.length < 10) {
      problems.push({ row: rowNo, message: `${r.name}: mobile number doesn't look right — skipped` });
      return;
    }

    let owner: string | null | undefined; // undefined = column blank, keep as is
    if (r.owner) {
      const ids = byName.get(r.owner.toLowerCase());
      if (!ids) {
        problems.push({ row: rowNo, message: `${r.name}: no staff member called "${r.owner}" — skipped` });
        return;
      }
      if (ids.length > 1) {
        problems.push({ row: rowNo, message: `${r.name}: more than one staff member is called "${r.owner}" — skipped` });
        return;
      }
      owner = ids[0];
      if (owner !== viewer.employeeId && !viewer.canAssignOthers) owner = viewer.employeeId;
    }

    const earlier = mobile ? byMobile.get(mobile) : undefined;
    if (earlier) {
      applyRow(earlier.kind === "update" ? earlier.patch : earlier.row, r, owner);
      return;
    }

    const found = mobile ? openByMobile.get(mobile) : undefined;
    if (found) {
      if (!mayUse(found, viewer)) {
        problems.push({ row: rowNo, message: `${r.name}: this number belongs to someone else's lead — skipped` });
        return;
      }
      const op: ImportOp = { kind: "update", rowNo, name: r.name, id: found.id, patch: { updated_at: nowIso } };
      applyRow(op.patch, r, owner);
      ops.push(op);
      byMobile.set(mobile, op);
      return;
    }

    const op: ImportOp = {
      kind: "insert",
      rowNo,
      name: r.name,
      row: {
        name: r.name,
        mobile,
        source: r.source,
        product_interest: r.productInterest,
        expected_value: r.expectedValue,
        stage: importStage(r.stage) || "new",
        likely_to_close: r.likelyToClose ?? false,
        assigned_employee_id: owner === undefined ? viewer.employeeId : owner,
        notes: r.notes,
        created_by: viewer.email,
      },
    };
    ops.push(op);
    if (mobile) byMobile.set(mobile, op);
  });

  return { ops, problems };
}
