import { describe, it, expect } from "vitest";
import { importStage, planLeadImport, type ExistingLead, type ImportInputRow, type ImportViewer } from "./lead-import-plan";

const NOW = "2026-09-10T05:00:00.000Z";
const staff = [
  { id: "asha-id", name: "Asha" },
  { id: "ravi-id", name: "Ravi" },
  { id: "twin-1", name: "Meera" },
  { id: "twin-2", name: "meera " },
];
const manager: ImportViewer = { employeeId: "boss-id", email: "boss@shop.in", seesAll: true, canAssignOthers: true };
const seller: ImportViewer = { employeeId: "asha-id", email: "asha@shop.in", seesAll: false, canAssignOthers: false };

const row = (over: Partial<ImportInputRow> = {}): ImportInputRow => ({ name: "Sneha", mobile: "9876543210", productInterest: "", expectedValue: 0, source: "", owner: "", stage: "", likelyToClose: null, notes: "", ...over });
const existing = (over: Partial<ExistingLead> = {}): ExistingLead => ({ id: "lead-1", mobile: "9876543210", assigned_employee_id: "asha-id", created_by: "asha@shop.in", ...over });

describe("importStage", () => {
  it("keeps only open stages — Won and Lost can't be imported", () => {
    expect(importStage("quoted")).toBe("quoted");
    expect(importStage("won")).toBe("");
    expect(importStage("lost")).toBe("");
    expect(importStage("whatever")).toBe("");
  });
});

describe("planLeadImport — new leads", () => {
  it("adds a lead owned by the importer when no owner column is given", () => {
    const { ops, problems } = planLeadImport([row({ productInterest: "Lehenga", expectedValue: 45000 })], staff, [], seller, NOW);
    expect(problems).toEqual([]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "insert", rowNo: 2, row: { name: "Sneha", mobile: "9876543210", stage: "new", assigned_employee_id: "asha-id", created_by: "asha@shop.in", product_interest: "Lehenga", expected_value: 45000, likely_to_close: false } });
  });

  it("never lets an import create a Won or Lost lead, whatever the file says", () => {
    const { ops } = planLeadImport([row({ stage: "won" }), row({ name: "B", mobile: "9876500000", stage: "lost" }), row({ name: "C", mobile: "9876500001", stage: "visit" })], staff, [], manager, NOW);
    expect(ops.map((o) => (o.kind === "insert" ? o.row.stage : null))).toEqual(["new", "new", "visit"]);
  });

  it("gives a lead to the person named in the Owner column, but only if the importer may assign", () => {
    expect(planLeadImport([row({ owner: "Ravi" })], staff, [], manager, NOW).ops[0]).toMatchObject({ row: { assigned_employee_id: "ravi-id" } });
    // a seller can't hand leads to other people — they stay with the seller
    expect(planLeadImport([row({ owner: "Ravi" })], staff, [], seller, NOW).ops[0]).toMatchObject({ row: { assigned_employee_id: "asha-id" } });
  });

  it("skips rows it can't use and says which sheet row (the header is row 1)", () => {
    const { ops, problems } = planLeadImport(
      [row({ name: "" }), row({ name: "Bad number", mobile: "12345" }), row({ name: "Ghost", owner: "Nobody" }), row({ name: "Twin", owner: "Meera", mobile: "9000000001" }), row({ name: "Fine", mobile: "9000000002" })],
      staff,
      [],
      manager,
      NOW
    );
    expect(ops).toHaveLength(1);
    expect(problems.map((p) => p.row)).toEqual([2, 3, 4, 5]);
    expect(problems[0].message).toMatch(/no name/i);
    expect(problems[1].message).toMatch(/mobile/i);
    expect(problems[2].message).toMatch(/no staff member/i);
    expect(problems[3].message).toMatch(/more than one/i);
  });

  it("lets a lead have no mobile at all (and never merges two of those)", () => {
    const { ops } = planLeadImport([row({ name: "A", mobile: "" }), row({ name: "B", mobile: "" })], staff, [], manager, NOW);
    expect(ops).toHaveLength(2);
  });
});

describe("planLeadImport — existing leads and repeats", () => {
  it("updates an open lead with the same number, changing only the columns that were filled in", () => {
    const { ops } = planLeadImport([row({ name: "Sneha K", expectedValue: 0, source: "Instagram", likelyToClose: true })], staff, [existing()], seller, NOW);
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.kind).toBe("update");
    if (op.kind === "update") {
      expect(op.id).toBe("lead-1");
      expect(op.patch).toMatchObject({ name: "Sneha K", source: "Instagram", likely_to_close: true, updated_at: NOW });
      expect(op.patch).not.toHaveProperty("expected_value"); // blank ₹ column leaves the amount alone
      expect(op.patch).not.toHaveProperty("assigned_employee_id");
      expect(op.patch).not.toHaveProperty("stage");
    }
  });

  it("won't touch someone else's lead", () => {
    const theirs = existing({ assigned_employee_id: "ravi-id", created_by: "ravi@shop.in" });
    const { ops, problems } = planLeadImport([row()], staff, [theirs], seller, NOW);
    expect(ops).toEqual([]);
    expect(problems[0].message).toMatch(/someone else/i);
    // but a manager can
    expect(planLeadImport([row()], staff, [theirs], manager, NOW).ops).toHaveLength(1);
  });

  it("treats a number repeated inside the file as the same lead, later rows filling in the earlier one", () => {
    const { ops } = planLeadImport([row({ productInterest: "Saree" }), row({ expectedValue: 8000, source: "Walk-in" })], staff, [], manager, NOW);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "insert", row: { product_interest: "Saree", expected_value: 8000, source: "Walk-in" } });
  });

  it("matches numbers however they are written", () => {
    const { ops } = planLeadImport([row({ mobile: "+91 98765 43210" })], staff, [existing()], seller, NOW);
    expect(ops[0].kind).toBe("update");
  });
});
