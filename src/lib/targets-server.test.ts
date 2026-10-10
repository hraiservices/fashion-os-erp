import { describe, it, expect } from "vitest";
import { canActOnLead, inBatches, ownershipFilter, type TargetsCtx } from "./targets-server";
import { DEFAULT_ROLE_DEFAULT_OVERRIDES, resolvePerms } from "./permissions";

const perms = (role: string, custom: Record<string, boolean> = {}) => resolvePerms(role, custom, DEFAULT_ROLE_DEFAULT_OVERRIDES);
const ctx = (over: Partial<TargetsCtx> = {}): TargetsCtx => ({ email: "Asha@Shop.in", role: "sales", perms: perms("sales"), employeeId: "emp-asha", seesAll: false, modules: {} as TargetsCtx["modules"], db: {} as TargetsCtx["db"], ...over });

describe("ownershipFilter", () => {
  it("is null for someone who sees everything", () => {
    expect(ownershipFilter(ctx({ seesAll: true }), "assigned_employee_id")).toBeNull();
  });
  it("keeps what is assigned to them or created by them (email matched in both cases)", () => {
    const f = ownershipFilter(ctx(), "assigned_employee_id");
    expect(f).toBe("created_by.eq.Asha@Shop.in,created_by.eq.asha@shop.in,assigned_employee_id.eq.emp-asha");
  });
  it("uses the column the table calls its owner", () => {
    expect(ownershipFilter(ctx(), "assignee_id")).toContain("assignee_id.eq.emp-asha");
  });
  it("still works for a login with no staff record", () => {
    expect(ownershipFilter(ctx({ employeeId: null }), "assignee_id")).toBe("created_by.eq.Asha@Shop.in,created_by.eq.asha@shop.in");
  });
  it("can't be broken out of by an odd email — filter-syntax characters are dropped", () => {
    const f = ownershipFilter(ctx({ email: 'a,b)(or=c"@x.in', employeeId: null }), "assignee_id") as string;
    expect(f).toBe("created_by.eq.abor=c@x.in");
    expect(f.split(",")).toHaveLength(1);
  });
});

describe("canActOnLead — who may win a lead from an order or invoice", () => {
  const lead = { assigned_employee_id: "emp-asha", created_by: "someone@shop.in" };
  const user = (role: string, over: Record<string, unknown> = {}, custom: Record<string, boolean> = {}) => ({ email: "asha@shop.in", employeeId: "emp-asha", perms: perms(role, custom), ...over });

  it("lets a manager work any lead", () => {
    expect(canActOnLead(user("manager", { employeeId: "emp-boss", email: "boss@shop.in" }), lead)).toBe(true);
  });
  it("lets staff work the leads assigned to them, or that they created", () => {
    expect(canActOnLead(user("sales"), lead)).toBe(true);
    expect(canActOnLead(user("sales", { employeeId: "emp-other" }), { assigned_employee_id: null, created_by: "ASHA@shop.in" })).toBe(true);
  });
  it("refuses a lead that belongs to someone else — an order can't win it", () => {
    expect(canActOnLead(user("sales", { employeeId: "emp-other", email: "other@shop.in" }), lead)).toBe(false);
  });
  it("refuses everyone without the Targets permissions, even for their own lead", () => {
    expect(canActOnLead(user("sales", {}, { manageLeads: false }), lead)).toBe(false);
    expect(canActOnLead(user("sales", {}, { accessTargets: false }), lead)).toBe(false);
    expect(canActOnLead(user("tailor"), lead)).toBe(false);
  });
});

describe("inBatches", () => {
  it("splits a long id list so no single request carries too many, and joins the answers", async () => {
    const calls: string[][] = [];
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const rows = await inBatches<string>(ids, async (batch) => {
      calls.push(batch);
      return { data: batch, error: null };
    });
    expect(calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(rows).toHaveLength(250);
  });
  it("makes no request at all for an empty list", async () => {
    let called = false;
    const rows = await inBatches<string>([], async () => {
      called = true;
      return { data: [], error: null };
    });
    expect(rows).toEqual([]);
    expect(called).toBe(false);
  });
  it("fails loudly if any batch fails, instead of quietly dropping those rows", async () => {
    await expect(inBatches<string>(["a"], async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
